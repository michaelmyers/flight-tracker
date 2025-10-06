import { db } from "./db.js";
import { AircraftInfoRow } from "./types.js";

interface Alert {
  id: number;
  name: string;
  zone_id: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

interface AlertSubscriber {
  id: number;
  alert_id: number;
  type: "webhook" | "email" | "websocket";
  endpoint: string;
  active: number;
  created_at: number;
}

interface AlertPayload {
  alert: {
    id: number;
    name: string;
    zone_id: number;
  };
  aircraft: {
    hex: string;
    type?: string;
    callsign?: string;
    altitude?: number;
    speed?: number;
    track?: number;
    manufacturer?: string;
    model?: string;
    operator?: string;
    registration?: string;
  };
  zone: {
    id: number;
    name: string;
  };
  triggered_at: string;
}

export class AlertEngine {
  private activeAlerts: Map<number, Alert> = new Map();
  private alertSubscribers: Map<number, AlertSubscriber[]> = new Map();
  private processedEntries: Set<string> = new Set(); // Track hex+zone combinations already alerted

  constructor() {
    this.loadAlerts();
    this.loadSubscribers();

    // Reload alerts periodically to catch updates
    setInterval(() => {
      this.loadAlerts();
      this.loadSubscribers();
    }, 30000); // Every 30 seconds

    // Clean up old processed entries periodically
    setInterval(() => {
      this.processedEntries.clear();
    }, 3600000); // Every hour
  }

  private loadAlerts(): void {
    const alerts = db.prepare(`
      SELECT id, name, zone_id, enabled, created_at, updated_at
      FROM alerts
      WHERE enabled = 1
    `).all() as Alert[];

    this.activeAlerts.clear();
    for (const alert of alerts) {
      this.activeAlerts.set(alert.id, alert);
    }

    console.log(`Loaded ${this.activeAlerts.size} active alerts`);
  }

  private loadSubscribers(): void {
    const subscribers = db.prepare(`
      SELECT id, alert_id, type, endpoint, active, created_at
      FROM alert_subscribers
      WHERE active = 1
    `).all() as AlertSubscriber[];

    this.alertSubscribers.clear();
    for (const sub of subscribers) {
      if (!this.alertSubscribers.has(sub.alert_id)) {
        this.alertSubscribers.set(sub.alert_id, []);
      }
      this.alertSubscribers.get(sub.alert_id)!.push(sub);
    }

    console.log(`Loaded ${subscribers.length} active subscribers`);
  }

  /**
   * Check if an aircraft entering a zone should trigger any alerts
   */
  public async checkAircraftEntry(
    hex: string,
    zoneId: number,
    aircraftType?: string,
    altitude?: number
  ): Promise<void> {
    const key = `${hex}-${zoneId}`;

    // Don't alert twice for the same aircraft/zone combination
    if (this.processedEntries.has(key)) {
      return;
    }

    // Find alerts for this zone
    const relevantAlerts = Array.from(this.activeAlerts.values()).filter(
      alert => alert.zone_id === zoneId
    );

    if (relevantAlerts.length === 0) {
      return;
    }

    // Get aircraft info
    const aircraftInfo = db.prepare(`
      SELECT * FROM aircraft_info WHERE hex = ?
    `).get(hex) as AircraftInfoRow | undefined;

    // Get zone info
    const zone = db.prepare(`
      SELECT id, name FROM areas WHERE id = ?
    `).get(zoneId) as { id: number; name: string } | undefined;

    if (!zone) {
      return;
    }

    // Mark as processed
    this.processedEntries.add(key);

    // Process each alert
    for (const alert of relevantAlerts) {
      const payload: AlertPayload = {
        alert: {
          id: alert.id,
          name: alert.name,
          zone_id: alert.zone_id
        },
        aircraft: {
          hex,
          type: aircraftType,
          altitude,
          manufacturer: aircraftInfo?.manufacturer || undefined,
          model: aircraftInfo?.model || undefined,
          operator: aircraftInfo?.operator || undefined,
          registration: aircraftInfo?.registration || undefined
        },
        zone: {
          id: zone.id,
          name: zone.name
        },
        triggered_at: new Date().toISOString()
      };

      // Save to history
      db.prepare(`
        INSERT INTO alert_history (alert_id, aircraft_hex, triggered_at, payload)
        VALUES (?, ?, ?, ?)
      `).run(alert.id, hex, Date.now(), JSON.stringify(payload));

      // Send notifications
      await this.sendNotifications(alert.id, payload);
    }
  }

  /**
   * Send notifications to all subscribers of an alert
   */
  private async sendNotifications(alertId: number, payload: AlertPayload): Promise<void> {
    const subscribers = this.alertSubscribers.get(alertId) || [];

    for (const sub of subscribers) {
      try {
        switch (sub.type) {
          case "webhook":
            await this.sendWebhook(sub.endpoint, payload);
            break;
          case "websocket":
            await this.sendWebSocketNotification(sub.endpoint, payload);
            break;
          case "email":
            // Email implementation would go here
            console.log(`Email notification to ${sub.endpoint} (not implemented)`);
            break;
        }

        // Mark as delivered
        db.prepare(`
          UPDATE alert_history
          SET delivered = 1
          WHERE alert_id = ? AND aircraft_hex = ?
          ORDER BY triggered_at DESC
          LIMIT 1
        `).run(alertId, payload.aircraft.hex);

      } catch (error) {
        console.error(`Failed to send ${sub.type} notification to ${sub.endpoint}:`, error);
      }
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(url: string, payload: AlertPayload): Promise<void> {
    try {
      // Use AbortController for timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "FlightTracker-AlertSystem/1.0"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      console.log(`Webhook sent successfully to ${url}`);
    } catch (error) {
      console.error(`Webhook error for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Send WebSocket notification
   */
  private async sendWebSocketNotification(sessionId: string, payload: AlertPayload): Promise<void> {
    // This will be handled by the WebSocket server
    // For now, we'll import and use the broadcast function
    const { broadcastAlertNotification } = await import("./web/websocketServer.js");
    broadcastAlertNotification(sessionId, payload);
  }

  /**
   * Clear processed entry when aircraft exits
   */
  public clearAircraftExit(hex: string, zoneId: number): void {
    const key = `${hex}-${zoneId}`;
    this.processedEntries.delete(key);
  }
}

// Singleton instance
export const alertEngine = new AlertEngine();