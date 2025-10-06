import { db } from "./db.js";

export interface Alert {
  id: number;
  name: string;
  zone_id: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface AlertSubscriber {
  id: number;
  alert_id: number;
  type: "webhook" | "email" | "websocket";
  endpoint: string;
  active: number;
  created_at: number;
}

export interface AlertHistory {
  id: number;
  alert_id: number;
  aircraft_hex: string;
  triggered_at: number;
  payload: string;
  delivered: number;
}

export function getAllAlerts(): Alert[] {
  return db.prepare(`
    SELECT id, name, zone_id, enabled, created_at, updated_at
    FROM alerts
    ORDER BY zone_id, name
  `).all() as Alert[];
}

export function getAlert(id: number): Alert | undefined {
  return db.prepare(`
    SELECT id, name, zone_id, enabled, created_at, updated_at
    FROM alerts
    WHERE id = ?
  `).get(id) as Alert | undefined;
}

export function createAlert(name: string, zoneId: number): Alert {
  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO alerts (name, zone_id, enabled, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?)
  `).run(name, zoneId, now, now);

  return getAlert(result.lastInsertRowid as number)!;
}

export function updateAlert(id: number, updates: Partial<{ name: string; enabled: boolean }>): boolean {
  const fields: string[] = [];
  const params: any = { id, updated_at: Date.now() };

  if (updates.name !== undefined) {
    fields.push("name = @name");
    params.name = updates.name;
  }

  if (updates.enabled !== undefined) {
    fields.push("enabled = @enabled");
    params.enabled = updates.enabled ? 1 : 0;
  }

  if (fields.length === 0) return false;

  fields.push("updated_at = @updated_at");
  const query = `UPDATE alerts SET ${fields.join(", ")} WHERE id = @id`;
  const result = db.prepare(query).run(params);

  return result.changes > 0;
}

export function deleteAlert(id: number): boolean {
  const result = db.prepare(`DELETE FROM alerts WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function getAlertSubscribers(alertId: number): AlertSubscriber[] {
  return db.prepare(`
    SELECT id, alert_id, type, endpoint, active, created_at
    FROM alert_subscribers
    WHERE alert_id = ?
    ORDER BY created_at DESC
  `).all(alertId) as AlertSubscriber[];
}

export function createSubscriber(
  alertId: number,
  type: "webhook" | "email" | "websocket",
  endpoint: string
): AlertSubscriber {
  const result = db.prepare(`
    INSERT INTO alert_subscribers (alert_id, type, endpoint, active, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(alertId, type, endpoint, Date.now());

  return db.prepare(`
    SELECT * FROM alert_subscribers WHERE id = ?
  `).get(result.lastInsertRowid) as AlertSubscriber;
}

export function deleteSubscriber(id: number): boolean {
  const result = db.prepare(`DELETE FROM alert_subscribers WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function getAlertHistory(alertId?: number, limit: number = 100): AlertHistory[] {
  if (alertId) {
    return db.prepare(`
      SELECT * FROM alert_history
      WHERE alert_id = ?
      ORDER BY triggered_at DESC
      LIMIT ?
    `).all(alertId, limit) as AlertHistory[];
  }

  return db.prepare(`
    SELECT * FROM alert_history
    ORDER BY triggered_at DESC
    LIMIT ?
  `).all(limit) as AlertHistory[];
}

export function getAlertsWithZones(): any[] {
  return db.prepare(`
    SELECT
      a.id,
      a.name as alert_name,
      a.enabled,
      a.created_at,
      a.updated_at,
      z.id as zone_id,
      z.name as zone_name,
      (SELECT COUNT(*) FROM alert_subscribers WHERE alert_id = a.id AND active = 1) as subscriber_count,
      (SELECT COUNT(*) FROM alert_history WHERE alert_id = a.id) as trigger_count
    FROM alerts a
    JOIN areas z ON a.zone_id = z.id
    ORDER BY z.name, a.name
  `).all();
}