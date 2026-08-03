import type { Request, Response } from "express";
import { reconcileLedgers } from "./reconcile";
import { metrics } from "../../lib/metrics";
import { logger } from "../../lib/logger";
import { getRedis } from "../../lib/redis";

export async function handleMetrics(req: Request, res: Response) {
  try {
    return res.json({ success: true, data: metrics.snapshot() });
  } catch (e) {
    logger.error({ err: String(e) }, "metrics failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleReconcile(req: Request, res: Response) {
  try {
    const result = await reconcileLedgers();
    const status = result.ok ? 200 : 409;
    // Cache the latest result in Redis for the dashboard.
    await getRedis().set("admin:reconcile:latest", JSON.stringify(result), "EX", 3600);
    return res.status(status).json({ success: result.ok, data: result });
  } catch (e) {
    logger.error({ err: String(e) }, "reconcile failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleReconcileLatest(req: Request, res: Response) {
  try {
    const raw = await getRedis().get("admin:reconcile:latest");
    if (!raw) {
      return res.status(404).json({ success: false, error: "No reconciliation run yet" });
    }
    return res.json({ success: true, data: JSON.parse(raw) });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}