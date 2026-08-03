import type { Request, Response } from "express";
import { prisma } from "@project-eryx/db";
import { z } from "zod";
import { placeOrder, cancelOrder, OrderError } from "../order/order.service";
import { getAgentAccount } from "./agent.service";
import { getMarketPrice } from "../../lib/redis";
import { getCandlesForSymbol } from "../candles/candles.controller";
import { placeArenaOrder } from "../arena/arena.service";
import { logger } from "../../lib/logger";

// Agents don't send account_id — it is derived from their API key server-side.
const agentOrderSchema = z
  .object({
    symbol: z.string().min(1).transform((s) => s.toUpperCase()),
    side: z.enum(["BUY", "SELL"]),
    type: z.enum(["LIMIT", "MARKET"]),
    qty: z.number().positive().finite(),
    limit_price: z.number().positive().finite().optional(),
  })
  .refine(
    (d) => d.type !== "LIMIT" || d.limit_price !== undefined,
    { message: "limit_price is required for LIMIT orders", path: ["limit_price"] }
  );

/** The agent's own AGENTIC account (resolved once per request). */
async function agentAccount(req: Request) {
  const agent = req.agent!;
  return getAgentAccount(agent.id);
}

export async function handleAgentOrder(req: Request, res: Response) {
  try {
    const parsed = agentOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const account = await agentAccount(req);
    const { symbol, side, type, qty, limit_price } = parsed.data;
    const result = await placeOrder({
      accountId: account.id,
      symbol,
      side,
      type,
      qty,
      limitPrice: limit_price,
    });
    return res.status(result.status === "OPEN" ? 202 : 201).json({ success: true, data: result });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    logger.error({ err: String(e) }, "agent order failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleAgentListOrders(req: Request, res: Response) {
  try {
    const account = await agentAccount(req);
    const orders = await prisma.orders.findMany({
      where: { account_id: account.id },
      orderBy: { created_at: "desc" },
      take: 100,
      include: { stock: true },
    });
    return res.json({ success: true, data: orders });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleAgentCancel(req: Request, res: Response) {
  try {
    const account = await agentAccount(req);
    const order = await cancelOrder(account.id, String(req.params.orderId));
    return res.json({ success: true, data: order });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleAgentPortfolio(req: Request, res: Response) {
  try {
    const account = await agentAccount(req);
    const holdings = await prisma.holdings.findMany({
      where: { account_id: account.id, quantity: { gt: 0 } },
      include: { stock: true },
    });

    let marketValue = 0;
    const positions = await Promise.all(
      holdings.map(async (h) => {
        const quote = await getMarketPrice(h.stock.symbol);
        const ltp = quote?.ltp ?? h.stock.current_price;
        const value = Number(h.quantity) * ltp;
        const cost = Number(h.quantity) * Number(h.average_buy_price);
        marketValue += value;
        return {
          symbol: h.stock.symbol,
          quantity: Number(h.quantity),
          average_buy_price: Number(h.average_buy_price),
          last_price: ltp,
          market_value: Math.round(value * 100) / 100,
          cost_basis: Math.round(cost * 100) / 100,
          unrealized_pnl: Math.round((value - cost) * 100) / 100,
        };
      })
    );

    const cash = Number(account.cash_balance);
    return res.json({
      success: true,
      data: {
        account_id: account.id,
        cash_balance: cash,
        equity: Math.round((cash + marketValue) * 100) / 100,
        positions_count: positions.length,
        positions,
      },
    });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleAgentPrice(req: Request, res: Response) {
  try {
    const symbol = String(req.params.symbol).toUpperCase();
    const quote = await getMarketPrice(symbol);
    if (!quote) {
      return res.status(503).json({ success: false, error: "No market data", code: "NO_MARKET_DATA" });
    }
    return res.json({ success: true, data: { symbol, ...quote } });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export async function handleAgentCandles(req: Request, res: Response) {
  try {
    const symbol = String(req.params.symbol).toUpperCase();
    const timeframe = String(req.query.timeframe ?? "1m");
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
    const data = await getCandlesForSymbol(symbol, timeframe, limit);
    if (data === null) {
      return res.status(404).json({ success: false, error: "Unknown symbol", code: "SYMBOL_NOT_FOUND" });
    }
    return res.json({ success: true, data });
  } catch (e) {
    logger.error({ err: String(e) }, "agent candles failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/** The agent's arena account (is_arena) — distinct from its paper account. */
async function agentArenaAccount(req: Request) {
  const agent = req.agent!;
  const account = await prisma.account.findFirst({ where: { agent_id: agent.id, is_arena: true } });
  if (!account) throw new OrderError("Agent has no arena account", 400, "NO_ARENA_ACCOUNT");
  return account;
}

/** Agent's arena portfolio (positions + cash on its arena account). */
export async function handleAgentArenaPortfolio(req: Request, res: Response) {
  try {
    const account = await agentArenaAccount(req);
    const holdings = await prisma.holdings.findMany({
      where: { account_id: account.id, quantity: { gt: 0 } },
      include: { stock: true },
    });
    let marketValue = 0;
    const positions = await Promise.all(
      holdings.map(async (h) => {
        const quote = await getMarketPrice(h.stock.symbol);
        const ltp = quote?.ltp ?? h.stock.current_price;
        const value = Number(h.quantity) * ltp;
        marketValue += value;
        return {
          symbol: h.stock.symbol,
          quantity: Number(h.quantity),
          average_buy_price: Number(h.average_buy_price),
          last_price: ltp,
          market_value: Math.round(value * 100) / 100,
        };
      })
    );
    const cash = Number(account.cash_balance);
    return res.json({
      success: true,
      data: {
        account_id: account.id,
        cash_balance: cash,
        equity: Math.round((cash + marketValue) * 100) / 100,
        positions_count: positions.length,
        positions,
      },
    });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    logger.error({ err: String(e) }, "agent arena portfolio failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/** Agent places an order in the AI Arena on its own (arena) account. */
export async function handleAgentArenaOrder(req: Request, res: Response) {
  try {
    const account = await agentArenaAccount(req);
    const parsed = agentOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const { symbol, side, type, qty, limit_price } = parsed.data;
    const result = await placeArenaOrder({
      accountId: account.id,
      symbol,
      side,
      type,
      qty,
      limitPrice: limit_price,
    });
    return res.status(result.status === "OPEN" ? 202 : 201).json({ success: true, data: result });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    logger.error({ err: String(e) }, "agent arena order failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
