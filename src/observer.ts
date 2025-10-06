import { db } from "./db.js";
import { insidePolygon } from "./geo.js";
import { checkAltitudeRequirements, getAltitudeDebugMessage } from "./utils/altitudeFilter.js";
import { Dump1090Aircraft, AircraftInfoRow } from "./types.js";
import dotenv from "dotenv";
import { broadcastAircraftUpdate } from "./web/websocketServer.js";
import { alertEngine } from "./alertEngine.js";

dotenv.config();

const piawareUrl = process.env.PIAWARE_URL!;
const pollMs = Number(process.env.POLL_MS ?? 10000);

const allAreas = db.prepare("SELECT id, polygon, min_altitude, max_altitude FROM areas");
const findOpenObs = db.prepare(`SELECT id FROM observations WHERE hex=@hex AND area_id=@area_id AND exited IS NULL`);
const openObsExit = db.prepare("UPDATE observations SET exited=@ts WHERE id=@id");
const createObs = db.prepare(
  `INSERT INTO observations (hex, type, area_id, entered) VALUES (@hex, @type, @area_id, @ts)`
);

const selectAircraftInfo = db.prepare("SELECT * FROM aircraft_info WHERE hex = ?");

const insertAircraftInfo = db.prepare<AircraftInfoRow>(
  `INSERT OR REPLACE INTO aircraft_info
   (hex, model, typecode, manufacturer, class, operator, registration, fetched_at)
   VALUES (@hex, @model, @typecode, @manufacturer, @class, @operator, @registration, @fetched_at)`
);

async function enrichAircraft(hex: string) {
  const existing = selectAircraftInfo.get(hex) as AircraftInfoRow;
  if (existing && Date.now() - existing.fetched_at < 30 * 24 * 3600_000) {
    return existing; // fresh enough
  }

  try {
    const res = await fetch(`https://opensky-network.org/api/metadata/aircraft/icao/${hex}`);
    if (!res.ok) throw new Error(`OpenSky error: ${res.status}`);
    const data = await res.json();

    const entry = {
      hex,
      model: data.model || null,
      typecode: data.typecode || null,
      manufacturer: data.manufacturerName || null,
      class: data.icaoAircraftClass || null,
      operator: data.operator || null,
      registration: data.registration || null,
      fetched_at: Date.now(),
    };

    console.log(`New entry for aircraft ${hex}:\n`, JSON.stringify(entry, null, 2));

    insertAircraftInfo.run(entry);
    return entry;
  } catch (err) {
    console.warn(`Failed to enrich aircraft ${hex}:`, err);
    return null;
  }
}

export function startObserver() {
  void poll();
  setInterval(() => void poll(), pollMs);
}

async function poll() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(piawareUrl, {
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const { aircraft } = (await res.json()) as { aircraft: Dump1090Aircraft[] };
    const ts = Date.now();
    const areas = allAreas.all() as {
      id: number;
      polygon: string;
      min_altitude: number | null;
      max_altitude: number | null;
    }[];

    // Debug log zone 4 altitude limits
    const zone4 = areas.find(a => a.id === 4);
    if (zone4) {
      console.log(`[ZONE 4 DEBUG] Zone loaded with min_altitude=${zone4.min_altitude}, max_altitude=${zone4.max_altitude}`);
    }

    for (const ac of aircraft) {
      // aircraft.forEach((ac) => {
      if (!ac.lat || !ac.lon) {
        // this happens a lot
        // console.warn(`Aircraft ${ac.hex} ${ac.type} has no lat/lon, skipping`);
        continue;
      }

      for (const { id: area_id, polygon, min_altitude, max_altitude } of areas) {
        const poly = JSON.parse(polygon) as [number, number][];

        // Check if aircraft is within polygon
        if (!insidePolygon(ac.lat!, ac.lon!, poly)) {
          continue;
        }

        // Check altitude constraints if they exist
        const altitude = ac.alt_baro;

        // Debug logging for zone 4 (ADW)
        if (area_id === 4) {
          console.log(`[ZONE 4 DEBUG] Aircraft ${ac.hex} (${ac.flight?.trim() || 'N/A'}) at ${altitude}ft, zone limits: min=${min_altitude}, max=${max_altitude}`);
          const debugMsg = getAltitudeDebugMessage(ac.hex, altitude, min_altitude, max_altitude, area_id);
          if (debugMsg) {
            console.log(debugMsg);
          }
        }

        // Check if aircraft meets altitude requirements
        if (!checkAltitudeRequirements(altitude, min_altitude, max_altitude)) {
          continue;
        }

        // Aircraft is in zone and meets altitude requirements
        console.log(`Aircraft ${ac.hex} ${ac.type} at ${altitude}ft is inside area ${area_id}`);

        await enrichAircraft(ac.hex).catch((err) => {
          console.warn(`Failed to enrich aircraft ${ac.hex}:`, err);
        });

        const open = findOpenObs.get({ hex: ac.hex, area_id }) as { id: number } | undefined;
        if (!open) {
          console.log(`Aircraft ${ac.hex} ${ac.type} entered area ${area_id} at altitude ${ac.alt_baro}`);
          createObs.run({ hex: ac.hex, type: ac.type ?? null, area_id, ts });

          const aircraftInfo = selectAircraftInfo.get(ac.hex) as AircraftInfoRow | undefined;
          broadcastAircraftUpdate({
            type: "enter",
            areaId: area_id,
            aircraft: {
              icao24: ac.hex,
              callsign: ac.flight?.trim(),
              altitude: ac.alt_baro,
              speed: ac.gs,
              track: ac.track,
              manufacturer: aircraftInfo?.manufacturer || undefined,
              model: aircraftInfo?.model || undefined,
              operator: aircraftInfo?.operator || undefined,
              enteredAt: new Date(ts).toISOString(),
              lastSeen: new Date(ts).toISOString()
            }
          });

          // Trigger alerts for this zone entry
          alertEngine.checkAircraftEntry(ac.hex, area_id, ac.type, ac.alt_baro).catch(err => {
            console.error(`Alert processing failed for ${ac.hex}:`, err);
          });
        }
      }

      // Check if aircraft has exited any zones
      const openObservations = db.prepare(
        "SELECT o.id, o.area_id FROM observations o WHERE o.hex = @hex AND o.exited IS NULL"
      ).all({ hex: ac.hex }) as { id: number; area_id: number }[];

      for (const obs of openObservations) {
        const area = areas.find(a => a.id === obs.area_id);
        if (!area) continue;

        const poly = JSON.parse(area.polygon) as [number, number][];
        const altitude = ac.alt_baro;

        // Check if still in zone
        const stillInZone = insidePolygon(ac.lat!, ac.lon!, poly) &&
          (area.min_altitude === null || altitude === undefined || altitude >= area.min_altitude) &&
          (area.max_altitude === null || altitude === undefined || altitude <= area.max_altitude);

        if (!stillInZone) {
          console.log(`Aircraft ${ac.hex} ${ac.type} exited area ${obs.area_id}`);
          openObsExit.run({ id: obs.id, ts });

          const aircraftInfo = selectAircraftInfo.get(ac.hex) as AircraftInfoRow | undefined;
          broadcastAircraftUpdate({
            type: "exit",
            areaId: obs.area_id,
            aircraft: {
              icao24: ac.hex,
              callsign: ac.flight?.trim(),
              altitude: ac.alt_baro,
              speed: ac.gs,
              track: ac.track,
              manufacturer: aircraftInfo?.manufacturer || undefined,
              model: aircraftInfo?.model || undefined,
              operator: aircraftInfo?.operator || undefined,
              exitedAt: new Date(ts).toISOString(),
              lastSeen: new Date(ts).toISOString()
            }
          });

          // Clear alert tracking for this aircraft/zone
          alertEngine.clearAircraftExit(ac.hex, obs.area_id);
        }
      }
    }
  } catch (err) {
    console.error("PiAware poll failed:", (err as Error).message);
  }
}
