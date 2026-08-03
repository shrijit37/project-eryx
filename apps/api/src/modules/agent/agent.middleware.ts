import type { Request, Response, NextFunction } from "express";
import { prisma } from "@project-eryx/db";
import { hashApiKey } from "./agent.service";
import { getRedis } from "../../lib/redis";
import { childLogger } from "../../lib/logger";

const log = childLogger("agent.auth");

const AGENT_RATE_LIMIT = Number(process.env.AGENT_RATE_LIMIT) || 60; // req / min / key

/**
 * Authenticate an AI agent via its API key (X-API-Key header, or
 * Authorization: Bearer <key>) and enforce a per-key rate limit in Redis —
 * a runaway agent script can never hammer the order endpoint.
 */
export async function authenticateAgent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const headerKey = req.headers["x-api-key"];
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    const key = (Array.isArray(headerKey) ? headerKey[0] : headerKey) ?? bearer;
    if (!key) {
      return res.status(401).json({ success: false, error: "API key required" });
    }

    const agent = await prisma.agent.findUnique({
      where: { api_key_hash: hashApiKey(key) },
    });
    if (!agent) {
      log.warn({}, "invalid api key");
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }
    if (!agent.is_active) {
      return res.status(403).json({ success: false, error: "Agent is disabled" });
    }

    // Per-key rate limit windowed by minute.
    const redis = getRedis();
    const bucket = Math.floor(Date.now() / 60_000);
    const rlKey = `rl:agent:${agent.id}:${bucket}`;
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, 70);
    if (count > AGENT_RATE_LIMIT) {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded",
        retryAfter: 60 - (Date.now() % 60_000) / 1000,
      });
    }

    req.agent = { ...agent } as never;
    next();
  } catch (e) {
    log.error({ err: String(e) }, "agent auth failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
