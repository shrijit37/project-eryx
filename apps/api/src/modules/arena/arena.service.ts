import { prisma } from "@project-eryx/db";
import { FeeModel, round2 } from "@project-eryx/execution-engine";
import type { OrderSide, OrderType } from "@project-eryx/shared-types";
import { ArenaBook, type ArenaRestingOrder } from "./book";
import { FEE_RATE } from "../../lib/constants";
import { getMarketPrice, publishAccountUpdate } from "../../lib/redis";
import { OrderError } from "../order/order.service";
import { childLogger } from "../../lib/logger";

const log = childLogger("arena");
const feeModel = new FeeModel(FEE_RATE);

/** In-process order books, one per arena symbol. */
const books = new Map<string, ArenaBook>();
/** Internal last-traded price per symbol (diverges from the real reference). */
const ltp = new Map<string, number>();

function getBook(symbol: string): ArenaBook {
  let book = books.get(symbol);
  if (!book) {
    book = new ArenaBook();
    books.set(symbol, book);
  }
  return book;
}

async function seedLtp(symbol: string): Promise<number> {
  const existing = ltp.get(symbol);
  if (existing && existing > 0) return existing;
  const quote = await getMarketPrice(symbol);
  const anchor = quote?.ltp || quote?.ask || quote?.bid || 0;
  ltp.set(symbol, anchor);
  return anchor;
}

export async function getArenaLtp(symbol: string): Promise<number> {
  return seedLtp(symbol);
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface ArenaFill {
  buyOrderId: string | null;
  sellOrderId: string | null;
  buyAccountId: string | null;
  sellAccountId: string | null;
  qty: number;
  price: number;
  maker: ArenaRestingOrder | null;
  symbol: string;
}

async function resolveStockId(tx: Tx, symbol: string): Promise<string> {
  const s = await tx.stocks.findUnique({ where: { symbol } });
  if (!s) throw new OrderError(`Unknown symbol: ${symbol}`, 404, "SYMBOL_NOT_FOUND");
  return s.id;
}

async function upsertHolding(
  tx: Tx,
  accountId: string,
  stockId: string,
  price: number,
  deltaQty: number
): Promise<void> {
  const holding = await tx.holdings.findUnique({
    where: { account_id_stock_id: { account_id: accountId, stock_id: stockId } },
  });
  const prevQty = holding ? Number(holding.quantity) : 0;
  const prevAvg = holding ? Number(holding.average_buy_price) : 0;
  const newQty = prevQty + deltaQty;
  const newAvg =
    deltaQty > 0
      ? prevQty === 0
        ? price
        : (prevQty * prevAvg + deltaQty * price) / (prevQty + deltaQty)
      : newQty === 0
        ? 0
        : prevAvg;
  await tx.holdings.upsert({
    where: { account_id_stock_id: { account_id: accountId, stock_id: stockId } },
    create: { account_id: accountId, stock_id: stockId, quantity: newQty, average_buy_price: newAvg },
    update: { quantity: newQty, average_buy_price: newAvg },
  });
}

async function updateOrderRemaining(tx: Tx, orderId: string | null, consumed: number): Promise<void> {
  if (!orderId) return;
  const order = await tx.orders.findUnique({ where: { id: orderId } });
  if (!order) return;
  const remaining = Math.max(Number(order.remaining_quantity) - consumed, 0);
  await tx.orders.update({
    where: { id: orderId },
    data: {
      remaining_quantity: remaining,
      status: remaining > 0 ? "PARTIALLY_FILLED" : "FILLED",
      executed_price: remaining > 0 ? order.executed_price : order.executed_price ?? 0,
    },
  });
}

/**
 * Settle one arena match bilaterally: move cash + shares between the two
 * accounts, write ledger + trade rows, and update both order states.
 * Accounts are locked in sorted-id order to avoid deadlocks.
 */
async function settleArenaFill(tx: Tx, fill: ArenaFill, stockId: string): Promise<void> {
  const ids = [fill.buyAccountId, fill.sellAccountId]
    .filter((id): id is string => id !== null)
    .sort();
  const locked = new Map<string, any>();
  for (const id of ids) {
    const [row]: any[] = await tx.$queryRaw`SELECT * FROM "Account" WHERE id = ${id} FOR UPDATE`;
    if (!row) throw new OrderError("Arena account not found", 404, "ACCOUNT_NOT_FOUND");
    if (row.status !== "ACTIVE") throw new OrderError("Arena account is not active", 400, "ACCOUNT_INACTIVE");
    locked.set(id, row);
  }

  const notional = fill.qty * fill.price;
  const buyFee = feeModel.compute(notional);
  const sellFee = feeModel.compute(notional);
  const now = new Date();

  if (fill.buyAccountId) {
    const acct = locked.get(fill.buyAccountId)!;
    const cash = Number(acct.cash_balance);
    const newBalance = round2(cash - notional - buyFee);
    await tx.account.update({ where: { id: fill.buyAccountId }, data: { cash_balance: newBalance } });
    await tx.cashLedger.create({
      data: {
        account_id: fill.buyAccountId,
        type: "BUY",
        amount: -notional,
        balance_after: round2(cash - notional),
        reference_id: fill.buyOrderId ?? "arena-synth",
        description: `ARENA BUY ${fill.qty} @ ${fill.price}`,
        created_at: now,
      },
    });
    if (buyFee > 0) {
      await tx.cashLedger.create({
        data: {
          account_id: fill.buyAccountId,
          type: "FEE",
          amount: -buyFee,
          balance_after: newBalance,
          reference_id: fill.buyOrderId ?? "arena-synth",
          description: "ARENA buy fee",
          created_at: now,
        },
      });
    }
    await upsertHolding(tx, fill.buyAccountId, stockId, fill.price, fill.qty);
  }

  if (fill.sellAccountId) {
    const acct = locked.get(fill.sellAccountId)!;
    const cash = Number(acct.cash_balance);
    const newBalance = round2(cash + notional - sellFee);
    await tx.account.update({ where: { id: fill.sellAccountId }, data: { cash_balance: newBalance } });
    await tx.cashLedger.create({
      data: {
        account_id: fill.sellAccountId,
        type: "SELL",
        amount: notional,
        balance_after: round2(cash + notional),
        reference_id: fill.sellOrderId ?? "arena-synth",
        description: `ARENA SELL ${fill.qty} @ ${fill.price}`,
        created_at: now,
      },
    });
    if (sellFee > 0) {
      await tx.cashLedger.create({
        data: {
          account_id: fill.sellAccountId,
          type: "FEE",
          amount: -sellFee,
          balance_after: newBalance,
          reference_id: fill.sellOrderId ?? "arena-synth",
          description: "ARENA sell fee",
          created_at: now,
        },
      });
    }
    await upsertHolding(tx, fill.sellAccountId, stockId, fill.price, -fill.qty);
  }

  await tx.trades.create({
    data: {
      account_id: fill.buyAccountId ?? fill.sellAccountId,
      stock_id: stockId,
      buy_order_id: fill.buyOrderId,
      sell_order_id: fill.sellOrderId,
      quantity: fill.qty,
      execution_price: fill.price,
      executed_at: now,
    },
  });

  await updateOrderRemaining(tx, fill.buyOrderId, fill.qty);
  await updateOrderRemaining(tx, fill.sellOrderId, fill.qty);
}

export interface PlaceArenaOrderInput {
  accountId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limitPrice?: number | undefined;
}

/**
 * Place an arena order. Limit orders rest in the in-memory book and match
 * against resting counterparties; price is set by real counterparty orders
 * (with a synthetic-anchor fallback so market orders always fill). Every
 * matched trade moves the internal arena LTP, letting agents move the price
 * independently of the real market.
 */
export async function placeArenaOrder(input: PlaceArenaOrderInput) {
  const account = await prisma.account.findUnique({ where: { id: input.accountId } });
  if (!account) throw new OrderError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  if (!account.is_arena) throw new OrderError("Account is not an arena account", 400, "NOT_ARENA");
  if (account.status !== "ACTIVE") throw new OrderError("Account is not active", 400, "ACCOUNT_INACTIVE");

  const stock = await prisma.stocks.findUnique({ where: { symbol: input.symbol } });
  if (!stock) throw new OrderError(`Unknown symbol: ${input.symbol}`, 404, "SYMBOL_NOT_FOUND");
  if (!stock.is_active) throw new OrderError("Instrument is not active", 400, "SYMBOL_INACTIVE");

  const anchor = await seedLtp(input.symbol);
  const book = getBook(input.symbol);
  const takerId = `ord_${Math.random().toString(36).slice(2, 14)}`;

  // Risk pre-checks (no phantom shorts, no over-spending).
  const holding = await prisma.holdings.findUnique({
    where: { account_id_stock_id: { account_id: input.accountId, stock_id: stock.id } },
  });
  const heldQty = holding ? Number(holding.quantity) : 0;
  if (input.side === "SELL" && heldQty < input.qty) {
    throw new OrderError(
      `Insufficient position: requested ${input.qty}, held ${heldQty}`,
      400,
      "INSUFFICIENT_POSITION"
    );
  }
  // Rough feasibility bound — real counterparty fills can only be cheaper.
  if (input.side === "BUY" && anchor > 0 && Number(account.cash_balance) < input.qty * anchor) {
    throw new OrderError("Insufficient cash for arena order", 400, "INSUFFICIENT_FUNDS");
  }

  // --- Build the fill plan against a working copy of the book ---
  const plan: ArenaFill[] = [];
  let takerRemaining = input.qty;
  const working = book.snapshot();
  const oppList = input.side === "BUY" ? working.asks : working.bids;

  for (const maker of oppList) {
    if (takerRemaining <= 0) break;
    if (maker.accountId === input.accountId) continue; // no self-trade
    if (maker.remaining <= 0) continue;
    if (input.type === "LIMIT") {
      if (input.side === "BUY" && maker.price > (input.limitPrice ?? 0)) break;
      if (input.side === "SELL" && maker.price < (input.limitPrice ?? 0)) break;
    }
    const fillQty = Math.min(takerRemaining, maker.remaining);
    plan.push({
      buyOrderId: input.side === "BUY" ? takerId : maker.orderId,
      sellOrderId: input.side === "SELL" ? takerId : maker.orderId,
      buyAccountId: input.side === "BUY" ? input.accountId : maker.accountId,
      sellAccountId: input.side === "SELL" ? input.accountId : maker.accountId,
      qty: fillQty,
      price: maker.price,
      maker,
      symbol: input.symbol,
    });
    takerRemaining -= fillQty;
    maker.remaining -= fillQty; // mutate the working copy only
  }

  if (input.type === "MARKET" && takerRemaining > 0) {
    plan.push({
      buyOrderId: input.side === "BUY" ? takerId : null,
      sellOrderId: input.side === "SELL" ? takerId : null,
      buyAccountId: input.side === "BUY" ? input.accountId : null,
      sellAccountId: input.side === "SELL" ? input.accountId : null,
      qty: takerRemaining,
      price: anchor,
      maker: null,
      symbol: input.symbol,
    });
    takerRemaining = 0;
  }

  if (plan.length === 0 && input.type === "MARKET") {
    throw new OrderError("No arena liquidity and no reference price", 503, "NO_LIQUIDITY");
  }

  // --- Persist atomically ---
  const order = await prisma.$transaction(async (tx) => {
    const stockId = await resolveStockId(tx, input.symbol);
    const created = await tx.orders.create({
      data: {
        id: takerId,
        account_id: input.accountId,
        stock_id: stockId,
        side: input.side,
        type: input.type,
        quantity: input.qty,
        remaining_quantity: input.qty,
        limit_price: input.limitPrice ?? null,
        executed_price: null,
        status: "PENDING",
      },
    });

    for (const fill of plan) {
      await settleArenaFill(tx, fill, stockId);
    }

    // No execution at all → pure resting limit = OPEN.
    const status =
      plan.length === 0
        ? "OPEN"
        : takerRemaining > 0
          ? "PARTIALLY_FILLED"
          : "FILLED";
    const lastPrice = plan.length ? plan[plan.length - 1]!.price : null;
    const final = await tx.orders.update({
      where: { id: takerId },
      data: { status, remaining_quantity: takerRemaining, executed_price: lastPrice },
    });
    if (lastPrice) {
      await tx.stocks.update({ where: { id: stockId }, data: { current_price: lastPrice } });
    }
    return final;
  });

  // --- Mutate the real book only after a successful commit ---
  if (plan.length) ltp.set(input.symbol, plan[plan.length - 1]!.price);
  for (const fill of plan) {
    if (fill.maker) {
      if (fill.maker.remaining <= 0) book.removeEntry(fill.maker);
    }
  }
  if (takerRemaining > 0 && input.type === "LIMIT" && input.limitPrice) {
    book.add({
      orderId: takerId,
      accountId: input.accountId,
      side: input.side,
      price: input.limitPrice,
      qty: input.qty,
      remaining: takerRemaining,
    });
  }

  log.info({ orderId: takerId, symbol: input.symbol, status: order.status }, "arena order placed");
  await publishAccountUpdate(input.accountId, "order", order);
  await publishAccountUpdate(input.accountId, "portfolio", { accountId: input.accountId });
  return { status: order.status, orderId: takerId, filledQty: input.qty - takerRemaining, order };
}

export async function getArenaBookView(symbol: string) {
  const book = getBook(symbol);
  const snap = book.snapshot();
  const bestBid = snap.bids[0]?.price ?? null;
  const bestAsk = snap.asks[0]?.price ?? null;
  const currentLtp = await getArenaLtp(symbol);
  const aggregate = (arr: ArenaRestingOrder[]) => {
    const agg = new Map<number, number>();
    for (const o of arr) agg.set(o.price, (agg.get(o.price) ?? 0) + o.remaining);
    return [...agg.entries()]
      .sort((a, b) => (arr === snap.bids ? b[0] - a[0] : a[0] - b[0]))
      .map(([price, qty]) => ({ price, qty: round2(qty) }));
  };
  return {
    symbol,
    ltp: currentLtp,
    spread: bestBid && bestAsk ? round2(bestAsk - bestBid) : null,
    best_bid: bestBid,
    best_ask: bestAsk,
    bids: aggregate(snap.bids),
    asks: aggregate(snap.asks),
  };
}

export async function cancelArenaOrder(accountId: string, orderId: string) {
  const order = await prisma.orders.findUnique({ where: { id: orderId }, include: { stock: true } });
  if (!order) throw new OrderError("Order not found", 404, "ORDER_NOT_FOUND");
  if (order.account_id !== accountId) throw new OrderError("Forbidden", 403, "FORBIDDEN");
  const removed = getBook(order.stock.symbol).cancel(orderId);
  if (!removed && !["OPEN", "PARTIALLY_FILLED"].includes(order.status)) {
    throw new OrderError(`Cannot cancel an order in status ${order.status}`, 400, "BAD_ORDER_STATE");
  }
  await prisma.orders.update({ where: { id: orderId }, data: { status: "CANCELLED", remaining_quantity: 0 } });
  return { orderId, status: "CANCELLED" };
}

/** Fresh arena bankroll for a newly-created arena account. */
export const ARENA_INITIAL_CAPITAL = 100_000;

/**
 * Create a funded arena account for a user (or one of their agents).
 * Initial capital is recorded as an immutable DEPOSIT; arena P&L is the
 * account's equity on a separate namespace from paper trading.
 */
export async function createArenaAccount(userId: string, agentId?: string) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        // Account.user_id is unique — an agent's arena account must not
        // collide with the user's paper account, so user_id stays null.
        user_id: agentId ? null : userId,
        agent_id: agentId ?? null,
        account_type: agentId ? "AGENTIC" : "USER",
        cash_balance: ARENA_INITIAL_CAPITAL,
        blocked_cash: 0,
        is_arena: true,
        currency: "USD",
        status: "ACTIVE",
      },
    });
    await tx.cashLedger.create({
      data: {
        account_id: account.id,
        type: "DEPOSIT",
        amount: ARENA_INITIAL_CAPITAL,
        balance_after: ARENA_INITIAL_CAPITAL,
        reference_id: `arena-initial-${account.id}`,
        description: "Initial arena bankroll",
        created_at: new Date(),
      },
    });
    return account;
  });
}

/** Arena P&L leaderboard — separate namespace from paper trading. */
export async function arenaLeaderboard(limit = 50) {
  const accounts = await prisma.account.findMany({
    where: { is_arena: true, status: "ACTIVE" },
    include: {
      user: { select: { username: true } },
      agent: { select: { name: true } },
      holdings: { where: { quantity: { gt: 0 } }, include: { stock: true } },
    },
  });
  const symbols = [...new Set(accounts.flatMap((a) => a.holdings.map((h) => h.stock.symbol)))];
  const prices = new Map<string, number>();
  for (const s of symbols) prices.set(s, await getArenaLtp(s));

  const rows = accounts.map((a) => {
    let marketValue = 0;
    for (const h of a.holdings) {
      const p = prices.get(h.stock.symbol) ?? 0;
      marketValue += Number(h.quantity) * p;
    }
    const cash = Number(a.cash_balance);
    const equity = round2(cash + marketValue);
    return {
      account_id: a.id,
      owner: a.agent?.name ?? a.user?.username ?? "anonymous",
      account_type: a.account_type,
      cash_balance: cash,
      market_value: round2(marketValue),
      equity,
    };
  });
  rows.sort((a, b) => b.equity - a.equity);
  return rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}
