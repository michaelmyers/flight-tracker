import crypto from "crypto";
import {
  WebhookSubscription,
  recordDeliverySuccess,
  recordDeliveryFailure,
  logDelivery,
} from "./webhookSubscriptions.js";

export interface WebhookPayload {
  event: "entry" | "exit";
  timestamp: string;
  subscription_id: number;

  zone: {
    type: "area" | "adhoc";
    area_id?: number;
    area_name?: string;
    center?: { lat: number; lon: number };
    radius_km?: number;
  };

  aircraft: {
    icao24: string;
    callsign?: string;
    type?: string;
    category?: string;

    position: {
      lat: number;
      lon: number;
      altitude_ft?: number;
      speed_knots?: number;
      track_degrees?: number;
    };

    manufacturer?: string;
    model?: string;
    operator?: string;
    registration?: string;
  };
}

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  durationMs: number;
  error?: string;
}

const TIMEOUT_MS = 10000;
const RETRY_DELAYS_MS = [1000, 5000, 15000];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

async function sendSingleRequest(
  url: string,
  payload: WebhookPayload,
  secret?: string | null
): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  const startTime = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "FlightTracker-Webhook/1.0",
    "X-Webhook-Event": payload.event,
    "X-Webhook-Subscription-Id": String(payload.subscription_id),
    "X-Webhook-Timestamp": String(Date.now()),
  };

  if (secret) {
    headers["X-Webhook-Signature"] = generateSignature(body, secret);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;

    if (response.ok) {
      return { success: true, statusCode: response.status, durationMs };
    }

    return {
      success: false,
      statusCode: response.status,
      durationMs,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const error = err instanceof Error ? err.message : String(err);

    if (error.includes("aborted")) {
      return { success: false, durationMs, error: `Timeout after ${TIMEOUT_MS}ms` };
    }

    return { success: false, durationMs, error };
  }
}

async function sendWithRetry(
  url: string,
  payload: WebhookPayload,
  secret?: string | null
): Promise<DeliveryResult> {
  let lastResult: DeliveryResult | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    lastResult = await sendSingleRequest(url, payload, secret);

    if (lastResult.success) {
      return lastResult;
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  return lastResult!;
}

export async function dispatchWebhook(
  subscription: WebhookSubscription,
  payload: WebhookPayload
): Promise<boolean> {
  const result = await sendWithRetry(subscription.url, payload, subscription.secret);

  logDelivery(
    subscription.id,
    payload.event,
    payload.aircraft.icao24,
    payload,
    result.success,
    result.statusCode,
    result.durationMs,
    result.error
  );

  if (result.success) {
    recordDeliverySuccess(subscription.id);
    console.log(`Webhook sent successfully to ${subscription.url} (${result.durationMs}ms)`);
  } else {
    const { disabled } = recordDeliveryFailure(subscription.id);
    console.error(`Webhook failed for ${subscription.url}: ${result.error}${disabled ? " - subscription disabled" : ""}`);
  }

  return result.success;
}

export async function testWebhook(
  subscription: WebhookSubscription
): Promise<{ success: boolean; statusCode?: number; durationMs: number; error?: string }> {
  const testPayload: WebhookPayload = {
    event: "entry",
    timestamp: new Date().toISOString(),
    subscription_id: subscription.id,
    zone: subscription.area_id
      ? { type: "area", area_id: subscription.area_id }
      : {
          type: "adhoc",
          center: { lat: subscription.adhoc_center_lat!, lon: subscription.adhoc_center_lon! },
          radius_km: subscription.adhoc_radius_km!,
        },
    aircraft: {
      icao24: "TEST00",
      callsign: "TEST",
      type: "TEST",
      position: {
        lat: 38.8,
        lon: -76.87,
        altitude_ft: 1000,
        speed_knots: 100,
        track_degrees: 90,
      },
      manufacturer: "Test Manufacturer",
      model: "Test Model",
      operator: "Test Operator",
      registration: "N00000",
    },
  };

  return sendSingleRequest(subscription.url, testPayload, subscription.secret);
}
