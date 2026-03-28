import { Router, Request, Response } from "express";
import { db } from "./db.js";
import {
  createSubscription,
  getSubscription,
  listSubscriptions,
  updateSubscription,
  deleteSubscription,
  reactivateSubscription,
  getDeliveryHistory,
  CreateSubscriptionRequest,
} from "./webhookSubscriptions.js";
import { testWebhook } from "./webhookDispatcher.js";

export const webhookRouter = Router();

// Create subscription
webhookRouter.post("/subscriptions", (req: Request, res: Response) => {
  try {
    const body = req.body as CreateSubscriptionRequest;

    // Validate required fields
    if (!body.url) {
      res.status(400).json({ error: "url is required" });
      return;
    }

    if (!body.area_id && !body.zone) {
      res.status(400).json({ error: "Either area_id or zone must be provided" });
      return;
    }

    if (body.area_id && body.zone) {
      res.status(400).json({ error: "Cannot specify both area_id and zone" });
      return;
    }

    // Validate area exists if area_id provided
    if (body.area_id) {
      const area = db.prepare("SELECT id FROM areas WHERE id = ?").get(body.area_id);
      if (!area) {
        res.status(400).json({ error: `Area ${body.area_id} not found` });
        return;
      }
    }

    // Validate zone format
    if (body.zone) {
      if (!body.zone.center || typeof body.zone.center.lat !== "number" || typeof body.zone.center.lon !== "number") {
        res.status(400).json({ error: "zone.center must have lat and lon numbers" });
        return;
      }
      if (typeof body.zone.radius_km !== "number" || body.zone.radius_km <= 0) {
        res.status(400).json({ error: "zone.radius_km must be a positive number" });
        return;
      }
    }

    const subscription = createSubscription(body);
    res.status(201).json(formatSubscription(subscription));
  } catch (err) {
    console.error("Error creating subscription:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// List subscriptions
webhookRouter.get("/subscriptions", (req: Request, res: Response) => {
  try {
    const filter: { active?: boolean; area_id?: number } = {};

    if (req.query.active !== undefined) {
      filter.active = req.query.active === "true";
    }

    if (req.query.area_id !== undefined) {
      filter.area_id = Number(req.query.area_id);
    }

    const subscriptions = listSubscriptions(filter);

    // Enrich with area names
    const enriched = subscriptions.map(sub => {
      const formatted = formatSubscription(sub);
      if (sub.area_id) {
        const area = db.prepare("SELECT name FROM areas WHERE id = ?").get(sub.area_id) as { name: string } | undefined;
        (formatted as Record<string, unknown>).area_name = area?.name;
      }
      return formatted;
    });

    res.json({ subscriptions: enriched });
  } catch (err) {
    console.error("Error listing subscriptions:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get single subscription
webhookRouter.get("/subscriptions/:id", (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const subscription = getSubscription(id);

    if (!subscription) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    const formatted = formatSubscription(subscription);
    if (subscription.area_id) {
      const area = db.prepare("SELECT name FROM areas WHERE id = ?").get(subscription.area_id) as { name: string } | undefined;
      (formatted as Record<string, unknown>).area_name = area?.name;
    }

    res.json(formatted);
  } catch (err) {
    console.error("Error getting subscription:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update subscription
webhookRouter.patch("/subscriptions/:id", (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const updates = req.body as Partial<CreateSubscriptionRequest>;

    const subscription = updateSubscription(id, updates);

    if (!subscription) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    res.json(formatSubscription(subscription));
  } catch (err) {
    console.error("Error updating subscription:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete subscription
webhookRouter.delete("/subscriptions/:id", (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const deleted = deleteSubscription(id);

    if (!deleted) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error("Error deleting subscription:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Reactivate subscription
webhookRouter.post("/subscriptions/:id/reactivate", (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const subscription = reactivateSubscription(id);

    if (!subscription) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    res.json(formatSubscription(subscription));
  } catch (err) {
    console.error("Error reactivating subscription:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get delivery history
webhookRouter.get("/subscriptions/:id/history", (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const subscription = getSubscription(id);
    if (!subscription) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    const history = getDeliveryHistory(id, limit);

    res.json({
      deliveries: history.map(h => ({
        ...h,
        created_at: new Date(h.created_at).toISOString(),
      })),
    });
  } catch (err) {
    console.error("Error getting delivery history:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Test webhook endpoint
webhookRouter.post("/subscriptions/:id/test", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const subscription = getSubscription(id);

    if (!subscription) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    const result = await testWebhook(subscription);

    res.json({
      success: result.success,
      status_code: result.statusCode,
      duration_ms: result.durationMs,
      error: result.error,
    });
  } catch (err) {
    console.error("Error testing webhook:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Format subscription for API response
function formatSubscription(sub: ReturnType<typeof getSubscription>) {
  if (!sub) return null;

  return {
    id: sub.id,
    url: sub.url,
    area_id: sub.area_id,
    zone: sub.adhoc_center_lat
      ? {
          center: { lat: sub.adhoc_center_lat, lon: sub.adhoc_center_lon },
          radius_km: sub.adhoc_radius_km,
        }
      : null,
    notify_entry: sub.notify_entry,
    notify_exit: sub.notify_exit,
    include_types: sub.include_types,
    exclude_types: sub.exclude_types,
    expires_at: sub.expires_at ? new Date(sub.expires_at).toISOString() : null,
    active: sub.active,
    consecutive_failures: sub.consecutive_failures,
    last_success_at: sub.last_success_at ? new Date(sub.last_success_at).toISOString() : null,
    last_failure_at: sub.last_failure_at ? new Date(sub.last_failure_at).toISOString() : null,
    created_at: new Date(sub.created_at).toISOString(),
    updated_at: new Date(sub.updated_at).toISOString(),
  };
}
