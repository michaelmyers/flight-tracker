import { db } from "./db.js";

export interface WebhookSubscription {
  id: number;
  url: string;
  secret: string | null;

  area_id: number | null;
  adhoc_center_lat: number | null;
  adhoc_center_lon: number | null;
  adhoc_radius_km: number | null;

  notify_entry: boolean;
  notify_exit: boolean;

  include_types: string[] | null;
  exclude_types: string[] | null;

  expires_at: number | null;
  active: boolean;

  consecutive_failures: number;
  last_failure_at: number | null;
  last_success_at: number | null;

  created_at: number;
  updated_at: number;
}

export interface CreateSubscriptionRequest {
  url: string;
  secret?: string;

  area_id?: number;
  zone?: {
    center: { lat: number; lon: number };
    radius_km: number;
  };

  notify_entry?: boolean;
  notify_exit?: boolean;

  include_types?: string[];
  exclude_types?: string[];

  ttl_seconds?: number;
}

interface DbRow {
  id: number;
  url: string;
  secret: string | null;
  area_id: number | null;
  adhoc_center_lat: number | null;
  adhoc_center_lon: number | null;
  adhoc_radius_km: number | null;
  notify_entry: number;
  notify_exit: number;
  include_types: string | null;
  exclude_types: string | null;
  expires_at: number | null;
  active: number;
  consecutive_failures: number;
  last_failure_at: number | null;
  last_success_at: number | null;
  created_at: number;
  updated_at: number;
}

function rowToSubscription(row: DbRow): WebhookSubscription {
  return {
    id: row.id,
    url: row.url,
    secret: row.secret,
    area_id: row.area_id,
    adhoc_center_lat: row.adhoc_center_lat,
    adhoc_center_lon: row.adhoc_center_lon,
    adhoc_radius_km: row.adhoc_radius_km,
    notify_entry: row.notify_entry === 1,
    notify_exit: row.notify_exit === 1,
    include_types: row.include_types ? JSON.parse(row.include_types) : null,
    exclude_types: row.exclude_types ? JSON.parse(row.exclude_types) : null,
    expires_at: row.expires_at,
    active: row.active === 1,
    consecutive_failures: row.consecutive_failures,
    last_failure_at: row.last_failure_at,
    last_success_at: row.last_success_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createSubscription(request: CreateSubscriptionRequest): WebhookSubscription {
  const now = Date.now();

  if (!request.area_id && !request.zone) {
    throw new Error("Either area_id or zone must be provided");
  }

  if (request.area_id && request.zone) {
    throw new Error("Cannot specify both area_id and zone");
  }

  const expiresAt = request.ttl_seconds
    ? now + request.ttl_seconds * 1000
    : null;

  const stmt = db.prepare(`
    INSERT INTO webhook_subscriptions (
      url, secret, area_id, adhoc_center_lat, adhoc_center_lon, adhoc_radius_km,
      notify_entry, notify_exit, include_types, exclude_types,
      expires_at, created_at, updated_at
    ) VALUES (
      @url, @secret, @area_id, @adhoc_center_lat, @adhoc_center_lon, @adhoc_radius_km,
      @notify_entry, @notify_exit, @include_types, @exclude_types,
      @expires_at, @created_at, @updated_at
    )
  `);

  const result = stmt.run({
    url: request.url,
    secret: request.secret || null,
    area_id: request.area_id || null,
    adhoc_center_lat: request.zone?.center.lat || null,
    adhoc_center_lon: request.zone?.center.lon || null,
    adhoc_radius_km: request.zone?.radius_km || null,
    notify_entry: request.notify_entry !== false ? 1 : 0,
    notify_exit: request.notify_exit !== false ? 1 : 0,
    include_types: request.include_types ? JSON.stringify(request.include_types) : null,
    exclude_types: request.exclude_types ? JSON.stringify(request.exclude_types) : null,
    expires_at: expiresAt,
    created_at: now,
    updated_at: now,
  });

  return getSubscription(result.lastInsertRowid as number)!;
}

export function getSubscription(id: number): WebhookSubscription | undefined {
  const row = db.prepare(`
    SELECT * FROM webhook_subscriptions WHERE id = ?
  `).get(id) as DbRow | undefined;

  return row ? rowToSubscription(row) : undefined;
}

export function listSubscriptions(filter?: {
  active?: boolean;
  area_id?: number;
}): WebhookSubscription[] {
  let sql = "SELECT * FROM webhook_subscriptions WHERE 1=1";
  const params: Record<string, unknown> = {};

  if (filter?.active !== undefined) {
    sql += " AND active = @active";
    params.active = filter.active ? 1 : 0;
  }

  if (filter?.area_id !== undefined) {
    sql += " AND area_id = @area_id";
    params.area_id = filter.area_id;
  }

  sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all(params) as DbRow[];
  return rows.map(rowToSubscription);
}

export function updateSubscription(
  id: number,
  updates: Partial<CreateSubscriptionRequest>
): WebhookSubscription | undefined {
  const existing = getSubscription(id);
  if (!existing) return undefined;

  const now = Date.now();
  const fields: string[] = ["updated_at = @updated_at"];
  const params: Record<string, unknown> = { id, updated_at: now };

  if (updates.url !== undefined) {
    fields.push("url = @url");
    params.url = updates.url;
  }

  if (updates.secret !== undefined) {
    fields.push("secret = @secret");
    params.secret = updates.secret || null;
  }

  if (updates.notify_entry !== undefined) {
    fields.push("notify_entry = @notify_entry");
    params.notify_entry = updates.notify_entry ? 1 : 0;
  }

  if (updates.notify_exit !== undefined) {
    fields.push("notify_exit = @notify_exit");
    params.notify_exit = updates.notify_exit ? 1 : 0;
  }

  if (updates.include_types !== undefined) {
    fields.push("include_types = @include_types");
    params.include_types = updates.include_types ? JSON.stringify(updates.include_types) : null;
  }

  if (updates.exclude_types !== undefined) {
    fields.push("exclude_types = @exclude_types");
    params.exclude_types = updates.exclude_types ? JSON.stringify(updates.exclude_types) : null;
  }

  if (updates.ttl_seconds !== undefined) {
    fields.push("expires_at = @expires_at");
    params.expires_at = updates.ttl_seconds ? now + updates.ttl_seconds * 1000 : null;
  }

  db.prepare(`UPDATE webhook_subscriptions SET ${fields.join(", ")} WHERE id = @id`).run(params);

  return getSubscription(id);
}

export function deleteSubscription(id: number): boolean {
  const result = db.prepare("DELETE FROM webhook_subscriptions WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getActiveSubscriptionsForArea(areaId: number): WebhookSubscription[] {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT * FROM webhook_subscriptions
    WHERE active = 1
      AND area_id = ?
      AND (expires_at IS NULL OR expires_at > ?)
  `).all(areaId, now) as DbRow[];

  return rows.map(rowToSubscription);
}

export function getActiveAdhocSubscriptions(): WebhookSubscription[] {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT * FROM webhook_subscriptions
    WHERE active = 1
      AND area_id IS NULL
      AND adhoc_center_lat IS NOT NULL
      AND (expires_at IS NULL OR expires_at > ?)
  `).all(now) as DbRow[];

  return rows.map(rowToSubscription);
}

export function recordDeliverySuccess(subscriptionId: number): void {
  const now = Date.now();
  db.prepare(`
    UPDATE webhook_subscriptions
    SET consecutive_failures = 0,
        last_success_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, subscriptionId);
}

export function recordDeliveryFailure(subscriptionId: number): { disabled: boolean } {
  const now = Date.now();
  const MAX_FAILURES = 5;

  const result = db.prepare(`
    UPDATE webhook_subscriptions
    SET consecutive_failures = consecutive_failures + 1,
        last_failure_at = ?,
        updated_at = ?
    WHERE id = ?
    RETURNING consecutive_failures
  `).get(now, now, subscriptionId) as { consecutive_failures: number } | undefined;

  if (!result) return { disabled: false };

  if (result.consecutive_failures >= MAX_FAILURES) {
    db.prepare(`
      UPDATE webhook_subscriptions
      SET active = 0, updated_at = ?
      WHERE id = ?
    `).run(now, subscriptionId);

    console.log(`Webhook subscription ${subscriptionId} disabled after ${result.consecutive_failures} consecutive failures`);
    return { disabled: true };
  }

  return { disabled: false };
}

export function reactivateSubscription(id: number): WebhookSubscription | undefined {
  const now = Date.now();
  db.prepare(`
    UPDATE webhook_subscriptions
    SET active = 1,
        consecutive_failures = 0,
        updated_at = ?
    WHERE id = ?
  `).run(now, id);

  return getSubscription(id);
}

export function cleanupExpiredSubscriptions(): number {
  const now = Date.now();
  const result = db.prepare(`
    UPDATE webhook_subscriptions
    SET active = 0, updated_at = ?
    WHERE active = 1
      AND expires_at IS NOT NULL
      AND expires_at < ?
  `).run(now, now);

  if (result.changes > 0) {
    console.log(`Expired ${result.changes} webhook subscription(s)`);
  }

  return result.changes;
}

export function logDelivery(
  subscriptionId: number,
  eventType: "entry" | "exit",
  aircraftHex: string,
  payload: object,
  success: boolean,
  statusCode?: number,
  durationMs?: number,
  errorMessage?: string
): void {
  db.prepare(`
    INSERT INTO webhook_delivery_log (
      subscription_id, event_type, aircraft_hex, payload,
      status_code, duration_ms, success, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    subscriptionId,
    eventType,
    aircraftHex,
    JSON.stringify(payload),
    statusCode ?? null,
    durationMs ?? null,
    success ? 1 : 0,
    errorMessage ?? null,
    Date.now()
  );
}

export function getDeliveryHistory(
  subscriptionId: number,
  limit = 50
): Array<{
  id: number;
  event_type: string;
  aircraft_hex: string;
  success: boolean;
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: number;
}> {
  const rows = db.prepare(`
    SELECT id, event_type, aircraft_hex, success, status_code, duration_ms, error_message, created_at
    FROM webhook_delivery_log
    WHERE subscription_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(subscriptionId, limit) as Array<{
    id: number;
    event_type: string;
    aircraft_hex: string;
    success: number;
    status_code: number | null;
    duration_ms: number | null;
    error_message: string | null;
    created_at: number;
  }>;

  return rows.map(row => ({
    ...row,
    success: row.success === 1,
  }));
}
