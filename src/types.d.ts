/** Raw aircraft object delivered by PiAware dump1090 feed */
export interface Dump1090Aircraft {
  hex: string; // 24‑bit ICAO identifier (lowercase hex)
  type?: string; // ICAO aircraft type designator (optional)
  lat?: number;
  lon?: number;
  category?: string; // ADS‑B emitter category ("H" = helicopter)
  flight?: string; // Callsign
  alt_baro?: number; // Barometric altitude in feet
  gs?: number; // Ground speed in knots
  track?: number; // Track angle in degrees
}

/** Geofence polygon as stored in DB — array of [lat,lon] pairs */
export type Polygon = [number, number][];

/** Entry/exit observation record */
export interface Observation {
  id: number;
  hex: string;
  area_id: number;
  entered: number; // epoch ms
  exited?: number; // epoch ms when left (undefined if still inside)
}

type ObservationRow = {
  hex: string;
  type: string | null;
  entered: number;
  exited: number | null;
  area: string;
  model: string | null;
  typecode: string | null;
  operator: string | null;
};

export type AircraftInfoRow = {
  hex: string;
  model: string | null;
  typecode: string | null;
  manufacturer: string | null;
  class: string | null;
  operator: string | null;
  registration: string | null;
  fetched_at: number;
};

export type AircraftClass = "helicopter" | "fixedwing" | "unknown";
