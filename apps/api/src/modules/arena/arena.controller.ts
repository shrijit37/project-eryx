import type { Request, Response } from "express";
import { prisma } from "@project-eryx/db";
import {
  placeArenaOrder,
  getArenaBookView,
  cancelArenaOrder,
  createArenaAccount,
  arenaLeaderboard,
} from "./arena.service";
import { OrderError } from "../order/order.service";
import { orderRequestSchema } from "../order/order.validation";
import { logger } from "../../lib/logger";

async function ownedArenaAccount(accountId: string, userId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { agent: true },
  });
  if (!account) throw new OrderError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  if (!account.is_arena) throw new OrderError("Not an arena account", 400, "NOT_ARENA");
  if (account.user_id !== userId && account.agent?.user_id !== userId) {
    throw new OrderError("Forbidden", 403, "FORBIDDEN");
  }
  return account;
}

export async function handleCreateArenaAccount(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const agentId = req.body?.agent_id ? String(req.body.agent_id) : undefined;
    if (agentId) {
      const agent = await prisma.agent.findUnique({ where: { id: agentId } });
      if (!agent || agent.user_id !== userId) {
        return res.status(404).json({ success: false, error: "Agent not found" });
      }
    }
    const account = await createArenaAccount(userId, agentId);
    return res.status(201).json({ success: true, data: account });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleArenaOrder(req: Request, res: Response) {
  try {
    const parsed = orderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
    await ownedArenaAccount(parsed.data.account_id, userId);

    const result = await placeArenaOrder({
      accountId: parsed.data.account_id,
      symbol: parsed.data.symbol,
      side: parsed.data.side,
      type: parsed.data.type,
      qty: parsed.data.qty,
      limitPrice: parsed.data.limit_price,
    });
    return res.status(result.status === "OPEN" ? 202 : 201).json({ success: true, data: result });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    logger.error({ err: String(e) }, "arena order failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleArenaCancel(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
    const accountId = String(req.params.account_id);
    await ownedArenaAccount(accountId, userId);
    const result = await cancelArenaOrder(accountId, String(req.params.orderId));
    return res.json({ success: true, data: result });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleArenaBook(req: Request, res: Response) {
  try {
    const symbol = String(req.params.symbol).toUpperCase();
    const data = await getArenaBookView(symbol);
    return res.json({ success: true, data });
  } catch (e) {
    logger.error({ err: String(e) }, "arena book failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleArenaLeaderboard(req: Request, res: Response) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const data = await arenaLeaderboard(limit);
    return res.json({ success: true, data });
  } catch (e) {
    logger.error({ err: String(e) }, "arena leaderboard failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}