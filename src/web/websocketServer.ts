import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { getObservations } from "../dbHelpers.js";
import EventEmitter from "events";
import { externalControlManager } from "./externalControl.js";
import dotenv from "dotenv";

dotenv.config();

export const aircraftEvents = new EventEmitter();

const piawareUrl = process.env.PIAWARE_URL!;

// Fetch current aircraft from PiAware
async function fetchCurrentAircraft() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(piawareUrl, {
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Failed to fetch aircraft data: ${res.status}`);
    }

    const data = await res.json();
    return data.aircraft || [];
  } catch (error) {
    console.error("Error fetching aircraft data:", error);
    return null;
  }
}

interface WebSocketClient extends WebSocket {
  areaId?: number;
  isAlive?: boolean;
  timeRange?: number;
  sessionId?: string;
  clientType?: "viewer" | "controller" | "standard" | "aircraft_subscriber";
}

interface AircraftUpdate {
  type: "enter" | "exit" | "update";
  areaId: number;
  aircraft: {
    icao24: string;
    callsign?: string;
    altitude?: number;
    speed?: number;
    track?: number;
    manufacturer?: string;
    model?: string;
    operator?: string;
    enteredAt?: string;
    exitedAt?: string;
    lastSeen?: string;
  };
}

export function initializeWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      const client = ws as WebSocketClient;
      if (client.isAlive === false) {
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  // Broadcast aircraft data to all subscribers every 2 seconds
  const aircraftBroadcast = setInterval(async () => {
    const aircraft = await fetchCurrentAircraft();
    if (aircraft) {
      wss.clients.forEach((ws: WebSocket) => {
        const client = ws as WebSocketClient;
        if (client.readyState === WebSocket.OPEN && client.clientType === "aircraft_subscriber") {
          client.send(JSON.stringify({
            type: "AIRCRAFT_UPDATE",
            aircraft: aircraft
          }));
        }
      });
    }
  }, 2000);

  wss.on("connection", (ws: WebSocket) => {
    const client = ws as WebSocketClient;
    client.isAlive = true;

    client.on("pong", () => {
      client.isAlive = true;
    });

    client.on("message", (message: string) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle external control messages
        if (data.type === "MODE" || data.type === "RANGE" || data.type === "ZONES" || data.type === "SELECT" ||
            data.type === "REGISTER_VIEWER" || data.type === "REGISTER_CONTROLLER" ||
            data.type === "STATE_REQUEST") {

          if (data.type === "REGISTER_VIEWER") {
            client.clientType = "viewer";
            client.sessionId = data.sessionId;
          } else if (data.type === "REGISTER_CONTROLLER") {
            client.clientType = "controller";
            client.sessionId = data.sessionId;
          }

          externalControlManager.handleControlMessage(client, data);
          return;
        }

        // Aircraft subscription for radar view
        if (data.type === "SUBSCRIBE_AIRCRAFT") {
          client.clientType = "aircraft_subscriber";
          client.sessionId = data.sessionId;
          console.log(`Client subscribed to live aircraft data for session ${data.sessionId}`);

          // Send initial aircraft data if available
          fetchCurrentAircraft().then(aircraft => {
            if (aircraft) {
              client.send(JSON.stringify({
                type: "AIRCRAFT_UPDATE",
                aircraft: aircraft
              }));
            }
          }).catch(err => {
            console.error("Error fetching initial aircraft:", err);
          });
        }

        // Original subscription logic
        if (data.type === "subscribe" && data.areaId) {
          client.areaId = data.areaId;
          client.clientType = "standard";
          const timeRange = data.timeRange || 1; // Default to 1 hour if not specified
          client.timeRange = timeRange;
          console.log(`Client subscribed to area ${data.areaId} with time range ${timeRange} hours`);

          const now = new Date();
          const hoursAgo = new Date(now.getTime() - timeRange * 60 * 60 * 1000);
          const recentObservations = getObservations({
            since: hoursAgo.toISOString(),
            areas: [data.areaId],
            limit: 100 // Increase limit to get more historical data
          });

          client.send(JSON.stringify({
            type: "initial",
            aircraft: recentObservations
          }));
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    client.on("close", (code, reason) => {
      const clientInfo = client.clientType ? `${client.clientType} (session: ${client.sessionId})` : "standard client";
      console.log(`Client disconnected: ${clientInfo}, code: ${code}, reason: ${reason || 'none'}`);
      // Unregister from external control if applicable
      if (client.clientType === "viewer" || client.clientType === "controller") {
        externalControlManager.unregisterClient(client);
      }
    });

    client.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  aircraftEvents.on("aircraftUpdate", (update: AircraftUpdate) => {
    wss.clients.forEach((ws: WebSocket) => {
      const client = ws as WebSocketClient;
      if (client.readyState === WebSocket.OPEN && client.areaId === update.areaId) {
        client.send(JSON.stringify(update));
      }
    });
  });

  wss.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(aircraftBroadcast);
  });

  return wss;
}

export function broadcastAircraftUpdate(update: AircraftUpdate): void {
  aircraftEvents.emit("aircraftUpdate", update);
}

export function broadcastAlertNotification(sessionId: string, payload: any): void {
  // Emit alert event that can be handled by WebSocket connections
  aircraftEvents.emit("alertNotification", { sessionId, payload });
}