import { Router, Request, Response } from "express";

import { db } from "./db.js";
import { parseSince } from "./utils/parseSince.js";
import { insidePolygon } from "./geo.js";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const piawareUrl = process.env.PIAWARE_URL!;

// ---------- areas ----------
router.post("/areas", (req: Request, res: Response) => {
  const { name } = req.body;
  let { polygon } = req.body;

  // GeoJSON auto-detection
  if (!polygon && req.body.type === "FeatureCollection") {
    try {
      const coords = req.body.features[0].geometry.coordinates[0];
      polygon = coords.map(([lon, lat]: [number, number]) => [lat, lon]);
    } catch {
      return res.status(400).json({ error: "Invalid GeoJSON FeatureCollection" });
    }
  }

  if (!name || !Array.isArray(polygon)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const stmt = db.prepare("INSERT INTO areas (name, polygon) VALUES (?, ?)");
  const info = stmt.run(name, JSON.stringify(polygon));
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get("/areas", (_req, res) => {
  res.json(db.prepare("SELECT id, name, polygon FROM areas").all());
});

router.delete("/areas/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid area ID" });
  }

  const result = db.prepare("DELETE FROM areas WHERE id = ?").run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Area not found" });
  }

  res.status(204).send();
});

// ---------- aircraft observations ----------
router.get("/aircraft", (req, res) => {
  const sinceRaw = req.query.since as string | undefined;
  const sinceParsed = sinceRaw ? parseSince(sinceRaw) : null;

  const from = req.query.from
    ? Number(new Date(req.query.from as string))
    : sinceParsed ?? Date.now() - 24 * 60 * 60 * 1000;

  const to = req.query.to ? Number(new Date(req.query.to as string)) : Date.now();

  const areaId = req.query.areaId ? Number(req.query.areaId) : undefined;

  const typeFilter = req.query.type ? String(req.query.type).toUpperCase() : undefined;

  const params: Record<string, any> = {
    from,
    to,
  };

  let whereClause = `
  WHERE o.entered BETWEEN @from AND @to
`;

  if (areaId !== undefined) {
    whereClause += " AND o.area_id = @areaId";
    params.areaId = areaId;
  }

  const query = `
  SELECT 
    o.hex,
    o.type,
    info.class AS category,
    o.area_id,
    a.name AS area,
    o.entered,
    o.exited,
    info.model,
    info.typecode,
    info.manufacturer AS manufacturerName,
    info.operator,
    info.registration
  FROM observations o
  JOIN areas a ON a.id = o.area_id
  LEFT JOIN aircraft_info info ON info.hex = o.hex
  ${whereClause}
`;

  const rows = db.prepare(query).all(params);

  const filtered = typeFilter ? rows.filter((r: any) => (r.type || "").toUpperCase().startsWith(typeFilter)) : rows;

  const enriched = filtered.map((row: any) => ({
    hex: row.hex,
    type: row.type ?? null,
    category: row.category ?? null,
    model: row.model ?? null,
    typecode: row.typecode ?? null,
    manufacturer: row.manufacturerName ?? null,
    operator: row.operator ?? null,
    country: row.country ?? null,
    lat: null,
    lon: null,
    areaId: row.area_id,
    area: row.area,
    entered: row.entered,
    exited: row.exited,
    enteredIso: new Date(row.entered).toISOString(),
    exitedIso: row.exited ? new Date(row.exited).toISOString() : null,
  }));

  res.json(enriched);
});

router.get("/observations", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `
    SELECT id, hex, type, area_id, entered, exited
    FROM observations
    ORDER BY entered DESC
  `
    )
    .all();

  res.json(rows);
});

// Aircraft enrichment function (similar to observer.ts)
async function enrichAircraft(hex: string) {
  const selectAircraftInfo = db.prepare("SELECT * FROM aircraft_info WHERE hex = ?");
  const insertAircraftInfo = db.prepare(`
    INSERT OR REPLACE INTO aircraft_info
    (hex, model, typecode, manufacturer, class, operator, registration, fetched_at)
    VALUES (@hex, @model, @typecode, @manufacturer, @class, @operator, @registration, @fetched_at)
  `);

  const existing = selectAircraftInfo.get(hex) as any;
  if (existing && Date.now() - existing.fetched_at < 30 * 24 * 3600_000) {
    return existing; // fresh enough
  }

  try {
    const res = await fetch(`https://opensky-network.org/api/metadata/aircraft/icao/${hex}`);

    // Handle 404s silently - aircraft not found in OpenSky database
    if (res.status === 404) {
      console.log("Aircraft not found in OpenSky:", hex);
      // Store a placeholder to prevent repeated lookups
      const entry = {
        hex,
        model: null,
        typecode: null,
        manufacturer: null,
        class: null,
        operator: null,
        registration: null,
        fetched_at: Date.now(),
      };
      insertAircraftInfo.run(entry);
      return entry;
    }

    if (!res.ok) throw new Error(`OpenSky error: ${res.status}`);

    const data = await res.json();

    console.log(`New entry for aircraft ${hex}:\n`, JSON.stringify(data, null, 2));

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

    insertAircraftInfo.run(entry);

    return entry;
  } catch (err: any) {
    // Only log non-404 errors and rate limits
    if (!err.message?.includes("404")) {
      console.warn(`Failed to enrich aircraft ${hex}:`, err.message || err);
    }
    return existing || null;
  }
}

// ---------- live aircraft ----------
router.get("/aircraft/live", async (req: Request, res: Response) => {
  try {
    const areaId = req.query.areaId ? Number(req.query.areaId) : undefined;

    // Fetch live data from PiAware
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(piawareUrl, {
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const { aircraft } = (await response.json()) as { aircraft: any[] };

    // Filter by area if specified
    let filteredAircraft = aircraft;
    if (areaId !== undefined) {
      const area = db.prepare("SELECT polygon FROM areas WHERE id = ?").get(areaId) as any;
      if (area) {
        const polygon = JSON.parse(area.polygon) as [number, number][];
        filteredAircraft = aircraft.filter((ac) => {
          if (!ac.lat || !ac.lon) return false;
          return insidePolygon(ac.lat, ac.lon, polygon);
        });
      }
    }

    // Enrich aircraft data and format response
    const enrichedAircraft = await Promise.all(
      filteredAircraft
        .filter((ac: any) => ac.lat && ac.lon)
        .map(async (ac: any) => {
          // Try to enrich aircraft info (but don't wait long)
          let info = null;
          try {
            info = await Promise.race([
              enrichAircraft(ac.hex),
              new Promise((resolve) => setTimeout(() => resolve(null), 1000)), // 1s timeout
            ]);
          } catch {
            // Fallback to existing data
            const selectAircraftInfo = db.prepare("SELECT * FROM aircraft_info WHERE hex = ?");
            info = selectAircraftInfo.get(ac.hex) as any;
          }

          return {
            icao24: ac.hex,
            lat: ac.lat,
            lon: ac.lon,
            altitude: ac.alt_baro || ac.altitude,
            speed: ac.gs,
            track: ac.track,
            callsign: ac.flight?.trim(),
            type: ac.type || info?.typecode,
            category: ac.category || info?.class,
            manufacturer: info?.manufacturer,
            model: info?.model,
            operator: info?.operator,
            registration: info?.registration,
          };
        })
    );

    res.json(enrichedAircraft);
  } catch (error) {
    console.error("Error fetching live aircraft:", error);
    res.status(500).json({ error: "Failed to fetch live aircraft data" });
  }
});

// ---------- stats ----------
router.get("/stats/daily", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `
    SELECT
      DATE(entered / 1000, 'unixepoch') AS day,
      COUNT(*) AS count
    FROM observations
    GROUP BY day
    ORDER BY day DESC
  `
    )
    .all();

  res.json(rows);
});

router.get("/stats/types", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `
    SELECT
      UPPER(COALESCE(type, 'UNKNOWN')) AS type,
      COUNT(*) AS count
    FROM observations
    GROUP BY type
    ORDER BY count DESC
  `
    )
    .all();

  res.json(rows);
});

router.get("/stats/areas", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `
    SELECT
      a.name AS area,
      COUNT(o.id) AS count
    FROM observations o
    JOIN areas a ON o.area_id = a.id
    GROUP BY o.area_id
    ORDER BY count DESC
  `
    )
    .all();

  res.json(rows);
});

export default router;
