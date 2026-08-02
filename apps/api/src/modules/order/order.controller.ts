import type { Request, Response } from "express";
import { prisma } from "@project-eryx/db";
import { orderRequestSchema } from "./order.validation";
import {
  OrderError,
  placeOrder,
  cancelOrder,
  listAccountOrders,
} from "./order.service";

/**
 * Resolve an account the authenticated user actually owns.
 * A user owns: their own USER account, and any AGENTIC account belonging
 * to one of their agents.
 */
export async function resolveOwnedAccount(
  accountId: string,
  userId: string
): Promise<string> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { agent: true },
  });
  if (!account) throw new OrderError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  if (account.user_id === userId) return account.id;
  if (account.account_type === "AGENTIC" && account.agent?.user_id === userId) {
    return account.id;
  }
  throw new OrderError("You do not have access to this account", 403, "FORBIDDEN");
}

export async function handleOrder(req: Request, res: Response) {
  try {
    const parsed = orderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const { account_id, symbol, side, type, qty, limit_price } = parsed.data;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const accountId = await resolveOwnedAccount(account_id, userId);
    const result = await placeOrder({
      accountId,
      symbol,
      side,
      type,
      qty,
      limitPrice: limit_price,
    });

    return res.status(result.status === "OPEN" ? 202 : 201).json({
      success: true,
      data: result,
    });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    console.error("[order] unexpected error:", e);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleListOrders(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const accountId =
      req.query.account_id && String(req.query.account_id).length > 0
        ? await resolveOwnedAccount(String(req.query.account_id), userId)
        : null;

    if (!accountId) {
      // Return orders across all of the user's accounts.
      const accounts = await prisma.account.findMany({
        where: { OR: [{ user_id: userId }, { agent: { user_id: userId } }] },
        select: { id: true },
      });
      const orders = await prisma.orders.findMany({
        where: { account_id: { in: accounts.map((a) => a.id) } },
        orderBy: { created_at: "desc" },
        take: 100,
        include: { stock: true },
      });
      return res.json({ success: true, data: orders });
    }

    const orders = await listAccountOrders(accountId, 100);
    return res.json({ success: true, data: orders });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    console.error("[order] list error:", e);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleCancelOrder(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const accountId = await resolveOwnedAccount(String(req.params.account_id), userId);
    const order = await cancelOrder(accountId, String(req.params.orderId));
    return res.json({ success: true, data: order });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    console.error("[order] cancel error:", e);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
