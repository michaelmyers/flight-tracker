import express, { Request, Response } from "express";
import path from "path";
import { readFileSync } from "fs";
import { getAreas, getArea, updateArea, getObservations } from "../dbHelpers.js";
import { externalControlManager } from "./externalControl.js";
import { db } from "../db.js";
import {
  getAlert,
  createAlert,
  updateAlert,
  deleteAlert,
  getAlertSubscribers,
  createSubscriber,
  deleteSubscriber,
  getAlertHistory,
  getAlertsWithZones
} from "../alertHelpers.js";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";

dotenv.config();

const __dirname = path.join(process.cwd(), "src", "web");

const router = express.Router();

router.use("/public", express.static(path.join(__dirname, "public")));

interface AircraftData {
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
  lat?: number;
  lon?: number;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const areas = getAreas();
    res.render("index", { areas });
  } catch (error) {
    console.error("Error rendering index:", error);
    res.status(500).send("Internal Server Error");
  }
});

// External control routes
router.get("/:sessionId/radar", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Create session if it doesn't exist
    externalControlManager.createSession(sessionId);
    const session = externalControlManager.getSession(sessionId);

    if (!session) {
      return res.status(404).send("Session not found");
    }

    // Get parameters from session state
    const range = session.currentView.range || 10;
    const zonesEnabled = session.currentView.zonesEnabled || false;
    const refreshRate = 1;
    const pollingRate = 1;

    const centerLat = parseFloat(process.env.ANTENNA_LAT || "38.9072");
    const centerLon = parseFloat(process.env.ANTENNA_LON || "-77.0369");

    const areas = getAreas();
    const zonesToDisplay = zonesEnabled ? areas : [];

    res.render("controlled-radar", {
      sessionId,
      area: {
        id: 0,
        name: "Antenna",
        polygon: "[]"
      },
      centerLat,
      centerLon,
      range,
      refreshRate,
      pollingRate,
      zones: zonesToDisplay,
      hasController: externalControlManager.hasControllers(sessionId)
    });
  } catch (error) {
    console.error("Error rendering controlled radar:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/:sessionId/area", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Create session if it doesn't exist
    externalControlManager.createSession(sessionId);
    const session = externalControlManager.getSession(sessionId);

    if (!session) {
      return res.status(404).send("Session not found");
    }

    // Determine which area to show based on session state
    const areas = getAreas();
    let areaId = 1; // Default to first area

    if (session.currentView.mode && session.currentView.mode.startsWith("zone_")) {
      areaId = parseInt(session.currentView.mode.replace("zone_", ""));
    }

    const area = areas.find((a: any) => a.id === areaId);
    if (!area) {
      return res.status(404).send("Area not found");
    }

    const hours = session.currentView.range || 1;
    const limit = 30;

    const now = new Date();
    const hoursAgo = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const observations = getObservations({
      since: hoursAgo.toISOString(),
      areas: [areaId],
      limit
    });

    // Fetch current live aircraft data from PiAware (same as regular area route)
    const liveAircraftMap = new Map();
    try {
      const piawareUrl = process.env.PIAWARE_URL!;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(piawareUrl, {
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.aircraft) {
          data.aircraft.forEach((ac: any) => {
            if (ac.hex) {
              liveAircraftMap.set(ac.hex, {
                altitude: ac.alt_baro || ac.alt_geom,
                speed: ac.gs, // ground speed
                track: ac.track,
                callsign: ac.flight?.trim(),
                lat: ac.lat,
                lon: ac.lon
              });
            }
          });
        }
      }
    } catch (error) {
      console.error("Error fetching live aircraft data:", error);
    }

    // Categorize aircraft (same as regular area route)
    const activeAircraft: AircraftData[] = [];
    const landedAircraft: AircraftData[] = [];
    const recentAircraft: AircraftData[] = [];

    observations.forEach((obs: any) => {
      const liveData = liveAircraftMap.get(obs.icao24);

      const aircraftData: AircraftData = {
        icao24: obs.icao24,
        callsign: liveData?.callsign || obs.callsign,
        altitude: liveData?.altitude ?? obs.altitude,
        speed: liveData?.speed ?? obs.speed,
        track: liveData?.track ?? obs.track,
        manufacturer: obs.manufacturer,
        model: obs.model,
        operator: obs.operator,
        enteredAt: obs.enteredAt,
        exitedAt: obs.exitedAt,
        lat: liveData?.lat,
        lon: liveData?.lon
      };

      if (!obs.exitedAt) {
        // Aircraft is still in zone - check if it's active or landed
        const hasAltitude = aircraftData.altitude !== null && aircraftData.altitude !== undefined;
        const hasSpeed = aircraftData.speed !== null && aircraftData.speed !== undefined;
        const isFlying = (hasAltitude && aircraftData.altitude! > 100) ||
                        (hasSpeed && aircraftData.speed! > 50);

        if (isFlying) {
          activeAircraft.push(aircraftData);
        } else {
          landedAircraft.push(aircraftData);
        }
      } else {
        recentAircraft.push(aircraftData);
      }
    });

    res.render("area", {
      sessionId,
      area,
      activeAircraft,
      landedAircraft,
      currentAircraft: [...activeAircraft, ...landedAircraft], // Keep for backward compatibility
      recentAircraft,
      currentTime: now.toISOString(),
      timeRange: hours,
      hasController: externalControlManager.hasControllers(sessionId)
    });
  } catch (error) {
    console.error("Error rendering controlled area:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Debug route for testing WebSocket connections
router.get("/debug/control", async (_req: Request, res: Response) => {
  res.render("debug-control");
});

router.get("/:sessionId/controls", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Create session if it doesn't exist
    externalControlManager.createSession(sessionId);
    const session = externalControlManager.getSession(sessionId);

    if (!session) {
      return res.status(404).send("Session not found");
    }

    const areas = getAreas();

    res.render("controls", {
      sessionId,
      currentState: session.currentView,
      areas
    });
  } catch (error) {
    console.error("Error rendering controls:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Original routes (non-controlled)
router.get("/radar", async (req: Request, res: Response) => {
  try {
    const range = parseInt(req.query.range as string) || 10; // Default 10 miles
    const refreshRate = parseInt(req.query.refresh as string) || 1; // Default 1 second
    const pollingRate = parseInt(req.query.poll as string) || 1; // Default 1 second for WebSocket updates

    // Get antenna location from environment or use default
    const centerLat = parseFloat(process.env.ANTENNA_LAT || "38.9072");
    const centerLon = parseFloat(process.env.ANTENNA_LON || "-77.0369");

    // Get zones to display from query param (e.g., displayZones=1,3,5)
    const displayZones = (req.query.displayZones as string || "").split(",").filter(Boolean).map(Number);

    // Get all areas and filter to requested zones
    const areas = getAreas();
    const zonesToDisplay = displayZones.length > 0
      ? areas.filter((a: any) => displayZones.includes(a.id))
      : [];

    res.render("radar", {
      area: {
        id: 0,
        name: "Antenna",
        polygon: "[]"
      },
      centerLat,
      centerLon,
      range,
      refreshRate,
      pollingRate,
      zones: zonesToDisplay
    });
  } catch (error) {
    console.error("Error rendering radar:", error);
    res.status(500).send("Internal Server Error");
  }
});

// API endpoints for zone management
router.get("/api/zones", async (_req: Request, res: Response) => {
  try {
    const areas = getAreas();
    res.json(areas);
  } catch (error) {
    console.error("Error fetching zones:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/api/zones/:id", async (req: Request, res: Response) => {
  try {
    const zoneId = parseInt(req.params.id);
    const zone = getArea(zoneId);

    if (!zone) {
      return res.status(404).json({ error: "Zone not found" });
    }

    res.json(zone);
  } catch (error) {
    console.error("Error fetching zone:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/api/zones/:id/stats", async (req: Request, res: Response) => {
  try {
    const zoneId = parseInt(req.params.id);
    const zone = getArea(zoneId);

    if (!zone) {
      return res.status(404).json({ error: "Zone not found" });
    }

    // Get current aircraft count
    const currentAircraftResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM observations
      WHERE area_id = ? AND exited IS NULL
    `).get(zoneId) as { count: number };

    // Get today's total
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTotalResult = db.prepare(`
      SELECT COUNT(DISTINCT hex) as count
      FROM observations
      WHERE area_id = ? AND entered >= ?
    `).get(zoneId, todayStart.getTime()) as { count: number };

    // Get last activity
    const lastSeenResult = db.prepare(`
      SELECT MAX(entered) as lastSeen
      FROM observations
      WHERE area_id = ?
    `).get(zoneId) as { lastSeen: number | null };

    // Get average altitude of current aircraft (we'd need live data for this)
    // For now, return null
    const avgAltitude = null;

    res.json({
      currentAircraft: currentAircraftResult.count,
      todayTotal: todayTotalResult.count,
      avgAltitude: avgAltitude,
      lastSeen: lastSeenResult.lastSeen
    });
  } catch (error) {
    console.error("Error fetching zone stats:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/api/zones/:id", express.json(), async (req: Request, res: Response) => {
  try {
    const zoneId = parseInt(req.params.id);
    const updates = req.body;

    // Validate altitude values if provided
    if (updates.min_altitude !== undefined && updates.min_altitude !== null) {
      const minAlt = parseInt(updates.min_altitude);
      if (isNaN(minAlt) || minAlt < 0) {
        return res.status(400).json({ error: "Invalid min_altitude value" });
      }
      updates.min_altitude = minAlt;
    }

    if (updates.max_altitude !== undefined && updates.max_altitude !== null) {
      const maxAlt = parseInt(updates.max_altitude);
      if (isNaN(maxAlt) || maxAlt < 0) {
        return res.status(400).json({ error: "Invalid max_altitude value" });
      }
      updates.max_altitude = maxAlt;
    }

    // Validate min < max if both provided
    if (updates.min_altitude !== null && updates.max_altitude !== null &&
        updates.min_altitude !== undefined && updates.max_altitude !== undefined &&
        updates.min_altitude > updates.max_altitude) {
      return res.status(400).json({ error: "min_altitude cannot be greater than max_altitude" });
    }

    const success = updateArea(zoneId, updates);

    if (!success) {
      return res.status(404).json({ error: "Zone not found or no changes made" });
    }

    const updatedZone = getArea(zoneId);
    res.json(updatedZone);
  } catch (error) {
    console.error("Error updating zone:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Zone editor page
router.get("/admin/zones", async (_req: Request, res: Response) => {
  try {
    const areas = getAreas();
    const alerts = getAlertsWithZones();
    res.render("admin-zones", { areas, alerts });
  } catch (error) {
    console.error("Error rendering zone management:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/admin/zones/editor", async (_req: Request, res: Response) => {
  try {
    const areas = getAreas();
    res.render("zone-editor", { areas });
  } catch (error) {
    console.error("Error rendering zone editor:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Alerts page
router.get("/admin/alerts", async (_req: Request, res: Response) => {
  try {
    const zones = getAreas();
    const alerts = getAlertsWithZones();
    res.render("alerts", { zones, alerts });
  } catch (error) {
    console.error("Error rendering alerts page:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Admin console page
router.get("/admin", async (_req: Request, res: Response) => {
  try {
    const fs = await import("fs");
    const areas = getAreas();
    const alerts = getAlertsWithZones();

    // Count documents
    const docsDir = path.join(process.cwd(), "docs");
    const docCount = fs.readdirSync(docsDir).filter((file: string) => file.endsWith(".md")).length;

    // Get database stats
    const dbPath = process.env.DB_PATH || "data/tracker.db";
    const dbStats = fs.statSync(dbPath);
    const dbSize = `${(dbStats.size / 1024 / 1024).toFixed(2)} MB`;

    // Get observation count
    const observationCount = db.prepare("SELECT COUNT(*) as count FROM observations").get() as { count: number };

    // Calculate uptime
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptime = `${hours}h ${minutes}m`;

    res.render("admin-dashboard", {
      areas,
      alerts,
      docCount,
      dbSize,
      observationCount: observationCount.count,
      uptime,
      process
    });
  } catch (error) {
    console.error("Error rendering admin console:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Alert API endpoints
router.get("/api/alerts", async (_req: Request, res: Response) => {
  try {
    const alerts = getAlertsWithZones();
    res.json(alerts);
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/api/alerts/:id", async (req: Request, res: Response) => {
  try {
    const alertId = parseInt(req.params.id);
    const alert = getAlert(alertId);

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    const subscribers = getAlertSubscribers(alertId);
    const history = getAlertHistory(alertId, 50);

    res.json({
      ...alert,
      subscribers,
      history
    });
  } catch (error) {
    console.error("Error fetching alert:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/alerts", express.json(), async (req: Request, res: Response) => {
  try {
    const { name, zone_id } = req.body;

    if (!name || !zone_id) {
      return res.status(400).json({ error: "Name and zone_id are required" });
    }

    const alert = createAlert(name, zone_id);
    res.status(201).json(alert);
  } catch (error) {
    console.error("Error creating alert:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/api/alerts/:id", express.json(), async (req: Request, res: Response) => {
  try {
    const alertId = parseInt(req.params.id);
    const updates = req.body;

    const success = updateAlert(alertId, updates);

    if (!success) {
      return res.status(404).json({ error: "Alert not found or no changes made" });
    }

    const updatedAlert = getAlert(alertId);
    res.json(updatedAlert);
  } catch (error) {
    console.error("Error updating alert:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/api/alerts/:id", async (req: Request, res: Response) => {
  try {
    const alertId = parseInt(req.params.id);
    const success = deleteAlert(alertId);

    if (!success) {
      return res.status(404).json({ error: "Alert not found" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting alert:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Alert subscriber endpoints
router.post("/api/alerts/:id/subscribers", express.json(), async (req: Request, res: Response) => {
  try {
    const alertId = parseInt(req.params.id);
    const { type, endpoint } = req.body;

    if (!type || !endpoint) {
      return res.status(400).json({ error: "Type and endpoint are required" });
    }

    if (!["webhook", "email", "websocket"].includes(type)) {
      return res.status(400).json({ error: "Invalid subscriber type" });
    }

    const subscriber = createSubscriber(alertId, type as any, endpoint);
    res.status(201).json(subscriber);
  } catch (error) {
    console.error("Error creating subscriber:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/api/subscribers/:id", async (req: Request, res: Response) => {
  try {
    const subscriberId = parseInt(req.params.id);
    const success = deleteSubscriber(subscriberId);

    if (!success) {
      return res.status(404).json({ error: "Subscriber not found" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting subscriber:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/area/:areaId", async (req: Request, res: Response) => {
  try {
    const { areaId } = req.params;
    const limit = parseInt(req.query.limit as string) || 30;
    const hours = parseInt(req.query.hours as string) || 1; // Default 1 hour, can be changed via ?hours=8

    const areas = getAreas();
    const area = areas.find((a: any) => a.id === parseInt(areaId));

    if (!area) {
      return res.status(404).send("Area not found");
    }

    const now = new Date();
    const hoursAgo = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const observations = getObservations({
      since: hoursAgo.toISOString(),
      areas: [parseInt(areaId)],
      limit
    });

    // Fetch current live aircraft data from PiAware
    const liveAircraftMap = new Map();
    try {
      const piawareUrl = process.env.PIAWARE_URL!;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(piawareUrl, {
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.aircraft) {
          data.aircraft.forEach((ac: any) => {
            if (ac.hex) {
              liveAircraftMap.set(ac.hex, {
                altitude: ac.alt_baro || ac.alt_geom,
                speed: ac.gs, // ground speed
                track: ac.track,
                callsign: ac.flight?.trim(),
                lat: ac.lat,
                lon: ac.lon
              });
            }
          });
        }
      }
    } catch (error) {
      console.error("Error fetching live aircraft data:", error);
    }

    // Separate aircraft into three categories
    const activeAircraft: AircraftData[] = [];    // Currently flying with ADS-B data
    const landedAircraft: AircraftData[] = [];    // In zone but no altitude/speed (landed)
    const recentAircraft: AircraftData[] = [];    // Already exited the zone

    observations.forEach((obs: any) => {
      // Get live data if available
      const liveData = liveAircraftMap.get(obs.icao24);

      const aircraftData: AircraftData = {
        icao24: obs.icao24,
        callsign: liveData?.callsign || obs.callsign,
        altitude: liveData?.altitude || obs.altitude,
        speed: liveData?.speed || obs.speed,
        track: liveData?.track || obs.track,
        manufacturer: obs.manufacturer,
        model: obs.model,
        operator: obs.operator,
        enteredAt: obs.enteredAt,
        exitedAt: obs.exitedAt
      };

      if (obs.exitedAt) {
        // Aircraft has exited the zone
        recentAircraft.push(aircraftData);
      } else if (
        (aircraftData.altitude !== null && aircraftData.altitude !== undefined && aircraftData.altitude > 100) ||
        (aircraftData.speed !== null && aircraftData.speed !== undefined && aircraftData.speed > 50)
      ) {
        // Aircraft is active (altitude > 100ft or speed > 50kts)
        activeAircraft.push(aircraftData);
      } else {
        // Aircraft is in zone but appears to be on ground (landed)
        landedAircraft.push(aircraftData);
      }
    });

    res.render("area", {
      area,
      activeAircraft,
      landedAircraft,
      currentAircraft: [...activeAircraft, ...landedAircraft], // Keep for backward compatibility
      recentAircraft,
      currentTime: now.toISOString(),
      timeRange: hours
    });
  } catch (error) {
    console.error("Error rendering aircraft list:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Documentation routes
router.get("/admin/docs", async (_req: Request, res: Response) => {
  try {
    const fs = await import("fs");
    const docsDir = path.join(process.cwd(), "docs");

    // Get list of markdown files
    const files = fs.readdirSync(docsDir).filter((file: string) => file.endsWith(".md"));

    // Create doc list with titles
    const docs = files.map((file: string) => {
      const name = file;
      // Convert filename to title (e.g., CONTROL_API.md -> Control API)
      const title = file
        .replace(".md", "")
        .split("_")
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");

      return { name, title };
    });

    // Sort alphabetically by title
    docs.sort((a, b) => a.title.localeCompare(b.title));

    res.render("docs", { docs });
  } catch (error) {
    console.error("Error rendering docs:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Serve individual markdown files
router.get("/admin/docs/:filename", async (req: Request, res: Response) => {
  try {
    const fs = await import("fs");
    const { filename } = req.params;

    // Validate filename (prevent directory traversal)
    if (!filename.endsWith(".md") || filename.includes("..") || filename.includes("/")) {
      return res.status(400).send("Invalid filename");
    }

    const filePath = path.join(process.cwd(), "docs", filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Document not found");
    }

    // Read and send the markdown content
    const content = fs.readFileSync(filePath, "utf-8");
    res.type("text/markdown").send(content);
  } catch (error) {
    console.error("Error serving markdown file:", error);
    res.status(500).send("Internal Server Error");
  }
});

// API Documentation with Swagger UI
const swaggerDocument = JSON.parse(
  readFileSync(path.join(__dirname, "swagger.json"), "utf8")
);

// Swagger UI options with minimal customization
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
  `,
  customSiteTitle: "Flight Tracker API Documentation",
  swaggerOptions: {
    docExpansion: 'none',
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    tryItOutEnabled: true
  }
};

router.use("/admin/api", swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));

function configureViews(app: express.Application) {
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
}

export default { router, configureViews };