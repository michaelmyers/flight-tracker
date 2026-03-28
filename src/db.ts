import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Ensure parent dir exists
const dbPath = process.env.DB_PATH || "data/tracker.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// Optionally drop unused 'snapshots' table if it exists, we no longer use it

try {
  db.prepare("DROP TABLE IF EXISTS snapshots").run();
  // console.log("Dropped obsolete 'snapshots' table.");
} catch (err) {
  console.warn("Could not drop 'snapshots' table:", (err as Error).message);
}

db.exec(`
CREATE TABLE IF NOT EXISTS areas (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  polygon  TEXT NOT NULL, -- JSON array of [lat, lon] pairs
  min_altitude INTEGER,    -- Minimum altitude in feet (optional)
  max_altitude INTEGER     -- Maximum altitude in feet (optional)
);

CREATE TABLE IF NOT EXISTS observations (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  hex       TEXT NOT NULL,
  area_id   INTEGER NOT NULL,
  entered   INTEGER NOT NULL,
  exited    INTEGER,
  FOREIGN KEY(area_id) REFERENCES areas(id)
);
`);

// Add altitude columns if they don't exist (for existing databases)
try {
  const tableInfo = db.prepare("PRAGMA table_info(areas)").all();
  const hasMinAltitude = tableInfo.some((col: any) => col.name === 'min_altitude');
  const hasMaxAltitude = tableInfo.some((col: any) => col.name === 'max_altitude');
  const hasHidden = tableInfo.some((col: any) => col.name === 'hidden');

  if (!hasMinAltitude) {
    db.prepare("ALTER TABLE areas ADD COLUMN min_altitude INTEGER").run();
    console.log("Added min_altitude column to areas table");
  }

  if (!hasMaxAltitude) {
    db.prepare("ALTER TABLE areas ADD COLUMN max_altitude INTEGER").run();
    console.log("Added max_altitude column to areas table");
  }

  if (!hasHidden) {
    db.prepare("ALTER TABLE areas ADD COLUMN hidden INTEGER DEFAULT 0").run();
    console.log("Added hidden column to areas table");
  }
} catch (err) {
  console.error("Error adding columns to areas table:", err);
}

db.exec(`
CREATE TABLE IF NOT EXISTS aircraft_info (
  hex TEXT PRIMARY KEY,
  model TEXT,
  typecode TEXT,
  manufacturer TEXT,
  class TEXT,
  operator TEXT,
  registration TEXT,
  fetched_at INTEGER
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  zone_id INTEGER NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(zone_id) REFERENCES areas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alert_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'webhook', 'email', 'websocket'
  endpoint TEXT NOT NULL, -- URL, email address, or session ID
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alert_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL,
  aircraft_hex TEXT NOT NULL,
  triggered_at INTEGER NOT NULL,
  payload TEXT NOT NULL, -- JSON with full aircraft details
  delivered INTEGER DEFAULT 0,
  FOREIGN KEY(alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);
`);

// 🔧 Add "type" column to observations if it's missing
const columns = db.prepare(`PRAGMA table_info(observations)`).all() as { name: string }[];
const hasType = columns.some((row) => row.name === "type");

if (!hasType) {
  db.exec(`ALTER TABLE observations ADD COLUMN type TEXT;`);
  console.log('✅ Added "type" column to observations');
}

// Webhook subscription tables for external server notifications
db.exec(`
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  secret TEXT,                    -- HMAC secret for signature verification

  -- Zone: area_id OR adhoc fields (mutually exclusive)
  area_id INTEGER,
  adhoc_center_lat REAL,
  adhoc_center_lon REAL,
  adhoc_radius_km REAL,

  notify_entry INTEGER DEFAULT 1,
  notify_exit INTEGER DEFAULT 1,

  include_types TEXT,             -- JSON array of types to include
  exclude_types TEXT,             -- JSON array of types to exclude

  expires_at INTEGER,             -- NULL = indefinite, otherwise epoch ms
  active INTEGER DEFAULT 1,
  consecutive_failures INTEGER DEFAULT 0,
  last_failure_at INTEGER,
  last_success_at INTEGER,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY(area_id) REFERENCES areas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webhook_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,       -- 'entry' or 'exit'
  aircraft_hex TEXT NOT NULL,
  payload TEXT NOT NULL,          -- Full JSON payload sent
  status_code INTEGER,
  duration_ms INTEGER,
  success INTEGER NOT NULL,
  error_message TEXT,
  created_at INTEGER NOT NULL,

  FOREIGN KEY(subscription_id) REFERENCES webhook_subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_area ON webhook_subscriptions(area_id) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_webhook_subs_expires ON webhook_subscriptions(expires_at) WHERE active = 1 AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_sub ON webhook_delivery_log(subscription_id, created_at);
`);
