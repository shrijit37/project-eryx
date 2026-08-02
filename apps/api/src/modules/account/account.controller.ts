import type { Request, Response } from "express";
import { prisma } from "@project-eryx/db";
import { depositSchema } from "./account.validation";
import { OrderError } from "../order/order.service";
import { getMarketPrice } from "../../lib/redis";
import { logger } from "../../lib/logger";

async function ownedAccountOrThrow(accountId: string, userId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { agent: true },
  });
  if (!account) throw new OrderError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  if (account.user_id !== userId && account.agent?.user_id !== userId) {
    throw new OrderError("Forbidden", 403, "FORBIDDEN");
  }
  return account;
}

export async function handleListAccounts(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const accounts = await prisma.account.findMany({
      where: { OR: [{ user_id: userId }, { agent: { user_id: userId } }] },
      include: {
        agent: { select: { id: true, name: true } },
        holdings: { include: { stock: true } },
      },
      orderBy: { created_at: "asc" },
    });
    return res.json({ success: true, data: accounts });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    logger.error({ err: String(e) }, "list accounts failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/** Full account detail: balance, holdings with live mark-to-market, and equity. */
export async function handleAccountDetail(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
    const account = await ownedAccountOrThrow(String(req.params.id), userId);

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
          name: h.stock.company_name,
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
        id: account.id,
        account_type: account.account_type,
        status: account.status,
        currency: account.currency,
        cash_balance: cash,
        blocked_cash: Number(account.blocked_cash),
        equity: Math.round((cash + marketValue) * 100) / 100,
        positions,
        positions_count: positions.length,
      },
    });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    logger.error({ err: String(e) }, "account detail failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/** Cash a user or agent account up. Recorded immutably in the ledger. */
export async function handleDeposit(req: Request, res: Response) {
  try {
    const parsed = depositSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { account_id, amount } = parsed.data;
    const account = await ownedAccountOrThrow(account_id, userId);

    const updated = await prisma.$transaction(async (tx) => {
      const [locked]: any[] = await tx.$queryRaw`SELECT * FROM "Account" WHERE id = ${account.id} FOR UPDATE`;
      const newBalance = Number(locked.cash_balance) + amount;
      await tx.account.update({
        where: { id: account.id },
        data: { cash_balance: newBalance },
      });
      await tx.cashLedger.create({
        data: {
          account_id: account.id,
          type: "DEPOSIT",
          amount,
          balance_after: newBalance,
          reference_id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          description: "Cash deposit",
          created_at: new Date(),
        },
      });
      return newBalance;
    });

    return res.json({ success: true, data: { account_id: account.id, cash_balance: updated } });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    logger.error({ err: String(e) }, "deposit failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/** Trade history for an account. */
export async function handleTrades(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
    const account = await ownedAccountOrThrow(String(req.params.id), userId);
    const trades = await prisma.trades.findMany({
      where: { account_id: account.id },
      orderBy: { executed_at: "desc" },
      take: 500,
      include: { stock: true },
    });
    return res.json({ success: true, data: trades });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    logger.error({ err: String(e) }, "trades lookup failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/** Ledger history for an account (immutable audit trail). */
export async function handleLedger(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });
    const account = await ownedAccountOrThrow(String(req.params.id), userId);
    const entries = await prisma.cashLedger.findMany({
      where: { account_id: account.id },
      orderBy: { created_at: "desc" },
      take: 500,
    });
    return res.json({ success: true, data: entries });
  } catch (e) {
    if (e instanceof OrderError) {
      return res.status(e.statusCode).json({ success: false, error: e.message, code: e.code });
    }
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
