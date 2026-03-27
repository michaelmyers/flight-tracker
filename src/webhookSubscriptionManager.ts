import { db } from "./db.js";
import { Dump1090Aircraft, AircraftInfoRow } from "./types.js";
import { insideCircle } from "./utils/geoCircle.js";
import { matchesTypeFilter, AircraftTypeInfo } from "./utils/aircraftTypeFilter.js";
import { dispatchWebhook, WebhookPayload } from "./webhookDispatcher.js";
import {
  WebhookSubscription,
  getActiveSubscriptionsForArea,
  getActiveAdhocSubscriptions,
  cleanupExpiredSubscriptions,
} from "./webhookSubscriptions.js";

// Track aircraft currently inside ad-hoc zones: hex -> Set<subscription_id>
const adhocTracking = new Map<string, Set<number>>();

// Start cleanup interval for expired subscriptions
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startCleanupInterval(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    cleanupExpiredSubscriptions();
  }, 5 * 60 * 1000); // Every 5 minutes

  // Also run immediately on startup
  cleanupExpiredSubscriptions();
}

export function stopCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

function buildAircraftTypeInfo(
  ac: Dump1090Aircraft,
  enrichedInfo?: AircraftInfoRow | null
): AircraftTypeInfo {
  return {
    type: ac.type,
    typecode: enrichedInfo?.typecode ?? undefined,
    category: ac.category,
    class: enrichedInfo?.class ?? undefined,
    manufacturer: enrichedInfo?.manufacturer ?? undefined,
  };
}

function buildPayload(
  subscription: WebhookSubscription,
  event: "entry" | "exit",
  ac: Dump1090Aircraft,
  enrichedInfo?: AircraftInfoRow | null,
  areaName?: string
): WebhookPayload {
  const zone: WebhookPayload["zone"] = subscription.area_id
    ? {
        type: "area",
        area_id: subscription.area_id,
        area_name: areaName,
      }
    : {
        type: "adhoc",
        center: {
          lat: subscription.adhoc_center_lat!,
          lon: subscription.adhoc_center_lon!,
        },
        radius_km: subscription.adhoc_radius_km!,
      };

  return {
    event,
    timestamp: new Date().toISOString(),
    subscription_id: subscription.id,
    zone,
    aircraft: {
      icao24: ac.hex,
      callsign: ac.flight?.trim(),
      type: ac.type,
      category: ac.category,
      position: {
        lat: ac.lat!,
        lon: ac.lon!,
        altitude_ft: ac.alt_baro,
        speed_knots: ac.gs,
        track_degrees: ac.track,
      },
      manufacturer: enrichedInfo?.manufacturer ?? undefined,
      model: enrichedInfo?.model ?? undefined,
      operator: enrichedInfo?.operator ?? undefined,
      registration: enrichedInfo?.registration ?? undefined,
    },
  };
}

function getAreaName(areaId: number): string | undefined {
  const area = db.prepare("SELECT name FROM areas WHERE id = ?").get(areaId) as
    | { name: string }
    | undefined;
  return area?.name;
}

export async function notifyEntry(
  ac: Dump1090Aircraft,
  areaId: number,
  enrichedInfo?: AircraftInfoRow | null
): Promise<void> {
  const subscriptions = getActiveSubscriptionsForArea(areaId);
  if (subscriptions.length === 0) return;

  const aircraftTypeInfo = buildAircraftTypeInfo(ac, enrichedInfo);
  const areaName = getAreaName(areaId);

  for (const sub of subscriptions) {
    if (!sub.notify_entry) continue;

    if (!matchesTypeFilter(aircraftTypeInfo, sub.include_types ?? undefined, sub.exclude_types ?? undefined)) {
      continue;
    }

    const payload = buildPayload(sub, "entry", ac, enrichedInfo, areaName);
    dispatchWebhook(sub, payload).catch(err => {
      console.error(`Failed to dispatch entry webhook for subscription ${sub.id}:`, err);
    });
  }
}

export async function notifyExit(
  ac: Dump1090Aircraft,
  areaId: number,
  enrichedInfo?: AircraftInfoRow | null
): Promise<void> {
  const subscriptions = getActiveSubscriptionsForArea(areaId);
  if (subscriptions.length === 0) return;

  const aircraftTypeInfo = buildAircraftTypeInfo(ac, enrichedInfo);
  const areaName = getAreaName(areaId);

  for (const sub of subscriptions) {
    if (!sub.notify_exit) continue;

    if (!matchesTypeFilter(aircraftTypeInfo, sub.include_types ?? undefined, sub.exclude_types ?? undefined)) {
      continue;
    }

    const payload = buildPayload(sub, "exit", ac, enrichedInfo, areaName);
    dispatchWebhook(sub, payload).catch(err => {
      console.error(`Failed to dispatch exit webhook for subscription ${sub.id}:`, err);
    });
  }
}

export async function checkAdhocZones(
  ac: Dump1090Aircraft,
  enrichedInfo?: AircraftInfoRow | null
): Promise<void> {
  if (!ac.lat || !ac.lon) return;

  const subscriptions = getActiveAdhocSubscriptions();
  if (subscriptions.length === 0) return;

  const aircraftTypeInfo = buildAircraftTypeInfo(ac, enrichedInfo);

  for (const sub of subscriptions) {
    const isInside = insideCircle(
      ac.lat,
      ac.lon,
      sub.adhoc_center_lat!,
      sub.adhoc_center_lon!,
      sub.adhoc_radius_km!
    );

    const trackedSubs = adhocTracking.get(ac.hex);
    const currentlyTracked = trackedSubs?.has(sub.id) ?? false;

    if (isInside && !currentlyTracked) {
      // Entry detected
      if (!adhocTracking.has(ac.hex)) {
        adhocTracking.set(ac.hex, new Set());
      }
      adhocTracking.get(ac.hex)!.add(sub.id);

      if (sub.notify_entry && matchesTypeFilter(aircraftTypeInfo, sub.include_types ?? undefined, sub.exclude_types ?? undefined)) {
        const payload = buildPayload(sub, "entry", ac, enrichedInfo);
        dispatchWebhook(sub, payload).catch(err => {
          console.error(`Failed to dispatch adhoc entry webhook for subscription ${sub.id}:`, err);
        });
      }
    } else if (!isInside && currentlyTracked) {
      // Exit detected
      adhocTracking.get(ac.hex)?.delete(sub.id);
      if (adhocTracking.get(ac.hex)?.size === 0) {
        adhocTracking.delete(ac.hex);
      }

      if (sub.notify_exit && matchesTypeFilter(aircraftTypeInfo, sub.include_types ?? undefined, sub.exclude_types ?? undefined)) {
        const payload = buildPayload(sub, "exit", ac, enrichedInfo);
        dispatchWebhook(sub, payload).catch(err => {
          console.error(`Failed to dispatch adhoc exit webhook for subscription ${sub.id}:`, err);
        });
      }
    }
  }
}

// Cleanup stale tracking entries periodically (aircraft that haven't been seen)
export function clearAircraftTracking(hex: string): void {
  adhocTracking.delete(hex);
}
