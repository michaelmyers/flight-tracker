import { db } from "./db.js";

interface Area {
  id: number;
  name: string;
  polygon: string;
  min_altitude?: number | null;
  max_altitude?: number | null;
}

interface ObservationQuery {
  since?: string;
  until?: string;
  areas?: number[];
  limit?: number;
}

interface ObservationResult {
  icao24: string;
  callsign?: string;
  altitude?: number;
  speed?: number;
  track?: number;
  manufacturer?: string;
  model?: string;
  operator?: string;
  enteredAt: string;
  exitedAt?: string;
  areaId: number;
}

export function getAreas(): Area[] {
  return db.prepare("SELECT id, name, polygon, min_altitude, max_altitude FROM areas").all() as Area[];
}

export function getArea(id: number): Area | undefined {
  return db.prepare("SELECT id, name, polygon, min_altitude, max_altitude FROM areas WHERE id = ?").get(id) as Area | undefined;
}

export function updateArea(id: number, updates: Partial<Omit<Area, 'id'>>): boolean {
  const currentArea = getArea(id);
  if (!currentArea) return false;

  const fields: string[] = [];
  const params: any = { id };

  if (updates.name !== undefined) {
    fields.push("name = @name");
    params.name = updates.name;
  }

  if (updates.polygon !== undefined) {
    fields.push("polygon = @polygon");
    params.polygon = updates.polygon;
  }

  if (updates.min_altitude !== undefined) {
    fields.push("min_altitude = @min_altitude");
    params.min_altitude = updates.min_altitude;
  }

  if (updates.max_altitude !== undefined) {
    fields.push("max_altitude = @max_altitude");
    params.max_altitude = updates.max_altitude;
  }

  if (fields.length === 0) return false;

  const query = `UPDATE areas SET ${fields.join(", ")} WHERE id = @id`;
  const result = db.prepare(query).run(params);

  return result.changes > 0;
}

export function getObservations(params: ObservationQuery): ObservationResult[] {
  const queryParams: Record<string, any> = {};
  const whereConditions: string[] = [];

  if (params.since) {
    whereConditions.push("o.entered >= @since");
    queryParams.since = new Date(params.since).getTime();
  }

  if (params.until) {
    whereConditions.push("o.entered <= @until");
    queryParams.until = new Date(params.until).getTime();
  }

  if (params.areas && params.areas.length > 0) {
    const placeholders = params.areas.map((_, i) => `@area_${i}`).join(",");
    whereConditions.push(`o.area_id IN (${placeholders})`);
    params.areas.forEach((areaId, i) => {
      queryParams[`area_${i}`] = areaId;
    });
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";
  const limitClause = params.limit ? `LIMIT ${params.limit}` : "";

  const query = `
    SELECT
      o.hex AS icao24,
      o.area_id AS areaId,
      o.entered,
      o.exited,
      info.manufacturer,
      info.model,
      info.operator
    FROM observations o
    LEFT JOIN aircraft_info info ON info.hex = o.hex
    ${whereClause}
    ORDER BY o.entered DESC
    ${limitClause}
  `;

  const rows = db.prepare(query).all(queryParams) as any[];

  return rows.map(row => ({
    icao24: row.icao24,
    callsign: undefined,
    altitude: undefined,
    speed: undefined,
    track: undefined,
    manufacturer: row.manufacturer || undefined,
    model: row.model || undefined,
    operator: row.operator || undefined,
    enteredAt: new Date(row.entered).toISOString(),
    exitedAt: row.exited ? new Date(row.exited).toISOString() : undefined,
    areaId: row.areaId
  }));
}