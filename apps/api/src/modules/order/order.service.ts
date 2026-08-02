import { prisma } from "@project-eryx/db";
import {
  FeeModel,
  RiskEngine,
  SlippageCurve,
  computeExecutionPrice,
  round2,
  type Quote,
} from "@project-eryx/execution-engine";
import type { OrderSide, OrderType } from "@project-eryx/shared-types";
import { getMarketPrice, publishAccountUpdate } from "../../lib/redis";
import { FEE_RATE, MARKET_HOURS_REQUIRED, PRICE_MAX_AGE_MS } from "../../lib/constants";
import { logger, childLogger } from "../../lib/logger";
import { metrics } from "../../lib/metrics";

/** Error that maps cleanly to an HTTP response. */
export class OrderError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "ORDER_ERROR"
  ) {
    super(message);
  }
}

export interface PlaceOrderInput {
  accountId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limitPrice?: number | undefined;
}

export interface FillResultRow {
  price: number;
  qty: number;
  fee: number;
}

const riskEngine = new RiskEngine();
const feeModel = new FeeModel(FEE_RATE);
const slippageCurve = new SlippageCurve();

/** A Prisma interactive-transaction client. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function quoteMaturityCheck(quote: Quote & { market_state?: string; ts?: number }): void {
  if (MARKET_HOURS_REQUIRED && quote.market_state === "CLOSED") {
    throw new OrderError("Market is closed for this instrument", 400, "MARKET_CLOSED");
  }
  // The market-data worker stores `ts` in Unix seconds; tolerate ms too.
  const rawTs = quote.ts ?? 0;
  const tsMs = rawTs < 1_000_000_000_000 ? rawTs * 1000 : rawTs;
  const ageMs = Date.now() - tsMs;
  if (ageMs > PRICE_MAX_AGE_MS) {
    throw new OrderError("Market data is stale — order rejected", 503, "STALE_PRICE");
  }
}

/** Whether a limit order can execute immediately given the live quote. */
export function isMarketable(side: OrderSide, limit: number, q: Quote): boolean {
  return side === "BUY" ? limit >= q.ask : limit <= q.bid;
}

/** Fill price, capped/floor-bound by a limit so a limit order never fills worse than its limit. */
export function effectiveFillPrice(
  side: OrderSide,
  limit: number | undefined,
  computed: { price: number; slippagePct: number }
): { price: number; slippagePct: number } {
  if (limit === undefined) return computed;
  const capped =
    side === "BUY" ? Math.min(computed.price, limit) : Math.max(computed.price, limit);
  return { price: round2(capped), slippagePct: computed.slippagePct };
}

/** The max qty this account can fill right now (cash for BUY, position for SELL). */
function affordableQty(
  side: OrderSide,
  price: number,
  cash: number,
  positionQty: number,
  requested: number
): number {
  if (side === "BUY") {
    const perUnitCost = price * (1 + FEE_RATE);
    if (perUnitCost <= 0) return 0;
    return Math.max(0, Math.min(requested, Math.floor(cash / perUnitCost)));
  }
  return Math.max(0, Math.min(requested, positionQty));
}

interface FinancialResult {
  fillQty: number;
  newBalance: number;
  newHoldingQty: number;
  newAvgBuy: number;
  fee: number;
  notional: number;
}

/**
 * The single source of truth for moving money/positions on a fill.
 * Locks the account row FOR UPDATE so independent orders on the same
 * account serialize — the #1 risk class per AGENTS.md.
 * Assumes `accountId`, `stockId`, `side`, `qty`, `price` are already
 * validated and that `qty` has been sized by affordability.
 */
async function applyFinancial(
  tx: Tx,
  args: {
    accountId: string;
    stockId: string;
    side: OrderSide;
    qty: number;
    price: number;
    orderId: string;
  }
): Promise<FinancialResult> {
  const { accountId, stockId, side, qty, price, orderId } = args;

  const [acct]: any[] = await tx.$queryRaw`SELECT * FROM "Account" WHERE id = ${accountId} FOR UPDATE`;
  if (!acct) throw new OrderError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  if (acct.status !== "ACTIVE") throw new OrderError("Account is not active", 400, "ACCOUNT_INACTIVE");
  const cash = Number(acct.cash_balance);

  const holding =
    (await tx.holdings.findUnique({
      where: { account_id_stock_id: { account_id: accountId, stock_id: stockId } },
    })) ?? null;
  const positionQty = holding ? Number(holding.quantity) : 0;
  const avgBuy = holding ? Number(holding.average_buy_price) : 0;

  const risk = riskEngine.check({
    side,
    qty,
    price,
    cashBalance: cash,
    positionQty,
    maxPositionSize: Infinity,
  });
  if (!risk.approved) throw new OrderError(risk.reasons.join("; "), 400, "RISK_REJECTED");

  // Money moving.
  const notional = qty * price;
  const fee = feeModel.compute(notional);
  const delta = side === "BUY" ? -(notional + fee) : notional - fee;
  const newBalance = Math.round((cash + delta) * 100) / 100;

  await tx.account.update({ where: { id: accountId }, data: { cash_balance: newBalance } });

  const now = new Date();
  await tx.cashLedger.createMany({
    data: [
      {
        account_id: accountId,
        type: side === "BUY" ? "BUY" : "SELL",
        amount: side === "BUY" ? -notional : notional,
        balance_after: side === "BUY" ? cash - notional : cash + notional,
        reference_id: orderId,
        description: `${side} ${qty} ${stockId.slice(0, 8)} @ ${price}`,
        created_at: now,
      },
      {
        account_id: accountId,
        type: "FEE",
        amount: -fee,
        balance_after: newBalance,
        reference_id: orderId,
        description: "Trading fee",
        created_at: now,
      },
    ],
  });

  // Position (avg-cost accounting: unchanged on a reduce).
  const newHoldingQty = side === "BUY" ? positionQty + qty : positionQty - qty;
  const newAvgBuy =
    side === "BUY"
      ? positionQty === 0
        ? price
        : (positionQty * avgBuy + qty * price) / (positionQty + qty)
      : newHoldingQty === 0
        ? 0
        : avgBuy;
  await tx.holdings.upsert({
    where: { account_id_stock_id: { account_id: accountId, stock_id: stockId } },
    create: { account_id: accountId, stock_id: stockId, quantity: newHoldingQty, average_buy_price: newAvgBuy },
    update: { quantity: newHoldingQty, average_buy_price: newAvgBuy },
  });

  // Immutable trade row (opposite side is the simulated market-maker → null FK).
  await tx.trades.create({
    data: {
      account_id: accountId,
      stock_id: stockId,
      buy_order_id: side === "BUY" ? orderId : null,
      sell_order_id: side === "SELL" ? orderId : null,
      quantity: qty,
      execution_price: price,
      executed_at: now,
    },
  });

  // Reflect the last print on the instrument.
  await tx.stocks.update({ where: { id: stockId }, data: { current_price: price, last_price_update: now } });

  return { fillQty: qty, newBalance, newHoldingQty, newAvgBuy, fee, notional };
}

/**
 * Placing an order that is immediately marketable:
 *  1. size a partial fill under the account lock (BUY ⇒ cash, SELL ⇒ position)
 *  2. require full fill on placement, else reject
 *  3. create the order row and apply the fill in one transaction
 */
async function createAndFill(
  args: {
    accountId: string;
    stockId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    qty: number;
    limitPrice?: number | undefined;
    price: number;
  }
) {
  const log = childLogger("order.exec");
  const { accountId, stockId, symbol, side, type, qty, limitPrice, price } = args;

  const result = await prisma.$transaction(async (tx) => {
    const [acct]: any[] = await tx.$queryRaw`SELECT * FROM "Account" WHERE id = ${accountId} FOR UPDATE`;
    if (!acct) throw new OrderError("Account not found", 404, "ACCOUNT_NOT_FOUND");
    const cash = Number(acct.cash_balance);
    const holding =
      (await tx.holdings.findUnique({
        where: { account_id_stock_id: { account_id: accountId, stock_id: stockId } },
      })) ?? null;
    const heldQty = holding ? Number(holding.quantity) : 0;

    const fillQty =
      side === "BUY"
        ? affordableQty("BUY", price, cash, heldQty, qty)
        : affordableQty("SELL", price, cash, heldQty, qty);

    // On placement: full-or-reject (deterministic). Partial fills come from the trigger loop.
    if (fillQty < qty) {
      throw new OrderError(
        side === "BUY"
          ? `Insufficient cash: need ${qty * price} but only ${fillQty} shares affordable`
          : `Insufficient position: requested ${qty}, held ${heldQty}`,
        400,
        "INSUFFICIENT_FUNDS"
      );
    }

    const order = await tx.orders.create({
      data: {
        account_id: accountId,
        stock_id: stockId,
        side,
        type,
        quantity: qty,
        remaining_quantity: qty,
        limit_price: limitPrice ?? null,
        executed_price: price,
        status: "PENDING",
      },
    });

    const fin = await applyFinancial(tx, { accountId, stockId, side, qty, price, orderId: order.id });

    const orderFinal = await tx.orders.update({
      where: { id: order.id },
      data: { status: "FILLED", remaining_quantity: 0, executed_price: price },
    });

    return { order: orderFinal, fin };
  });

  log.info({ orderId: result.order.id, price, symbol }, "order filled");
  return result;
}

/**
 * Fill the remaining qty of a resting limit order once its price crosses.
 * A partial fill (PARTIALLY_FILLED) is produced when the account can only
 * cover part of the remaining quantity in this tick.
 */
export async function fillExistingOrder(orderId: string) {
  const log = childLogger("order.trigger");
  const existing = await prisma.orders.findUnique({ where: { id: orderId }, include: { stock: true } });
  if (!existing) return null;
  if (!["OPEN", "PARTIALLY_FILLED"].includes(existing.status) || existing.remaining_quantity <= 0) {
    return null;
  }

  const quote = await getMarketPrice(existing.stock.symbol);
  if (!quote) return null; // no feed → try again next tick
  if (!isMarketable(existing.side, existing.limit_price ?? quote.ask, quote)) return null;

  const computed = computeExecutionPrice({
    side: existing.side,
    qty: existing.remaining_quantity,
    quote,
    slippageCurve,
  });
  const { price } = effectiveFillPrice(existing.side, existing.limit_price ?? undefined, computed);

  const result = await prisma.$transaction(async (tx) => {
    const [acct]: any[] = await tx.$queryRaw`SELECT * FROM "Account" WHERE id = ${existing.account_id} FOR UPDATE`;
    const holding =
      (await tx.holdings.findUnique({
        where: { account_id_stock_id: { account_id: existing.account_id, stock_id: existing.stock_id } },
      })) ?? null;
    const heldQty = holding ? Number(holding.quantity) : 0;

    const fillQty =
      existing.side === "BUY"
        ? affordableQty("BUY", price, Number(acct.cash_balance), heldQty, existing.remaining_quantity)
        : affordableQty("SELL", price, Number(acct.cash_balance), heldQty, existing.remaining_quantity);
    if (fillQty <= 0) return null;

    const fin = await applyFinancial(tx, {
      accountId: existing.account_id,
      stockId: existing.stock_id,
      side: existing.side,
      qty: fillQty,
      price,
      orderId: existing.id,
    });

    // Running weighted-average executed price across partial fills.
    const executedSoFar = Number(existing.quantity) - Number(existing.remaining_quantity);
    const oldAvg = Number(existing.executed_price ?? 0);
    const newExecutedQty = executedSoFar + fillQty;
    const newAvg = oldAvg === 0 ? price : (executedSoFar * oldAvg + fillQty * price) / newExecutedQty;
    const newRemaining = Number(existing.remaining_quantity) - fillQty;
    const status = newRemaining > 0 ? "PARTIALLY_FILLED" : "FILLED";

    const updated = await tx.orders.update({
      where: { id: existing.id },
      data: { status, remaining_quantity: newRemaining, executed_price: round2(newAvg) },
    });
    return { updated, fillQty, price, fee: fin.fee };
  });

  if (!result) return null;
  log.info({ orderId, fillQty: result.fillQty, price: result.price, status: result.updated.status }, "limit order triggered");
  await publishAccountUpdate(existing.account_id, "order", result.updated);
  await publishAccountUpdate(existing.account_id, "portfolio", { accountId: existing.account_id });
  return result;
}

/**
 * Full order placement pipeline.
 * 1. Resolve instrument  2. Fetch + maturity-check live quote
 * 3. Decide marketable / resting  4. Execute or queue transactionally
 */
export async function placeOrder(input: PlaceOrderInput) {
  const log = childLogger("order");
  const startedAt = performance.now();
  log.info({ symbol: input.symbol, side: input.side, type: input.type, qty: input.qty }, "placing order");
  metrics.inc("orders_received");

  const stock = await prisma.stocks.findUnique({ where: { symbol: input.symbol } });
  if (!stock) throw new OrderError(`Unknown symbol: ${input.symbol}`, 404, "SYMBOL_NOT_FOUND");
  if (!stock.is_active) throw new OrderError("Instrument is not active", 400, "SYMBOL_INACTIVE");

  const quote = await getMarketPrice(input.symbol);
  if (!quote) throw new OrderError("No market data available for this symbol", 503, "NO_MARKET_DATA");
  quoteMaturityCheck(quote);

  const isLimit = input.type === "LIMIT";
  const marketable = isLimit && input.limitPrice !== undefined
    ? isMarketable(input.side, input.limitPrice, quote)
    : true;

  if (!marketable) {
    const order = await prisma.orders.create({
      data: {
        account_id: input.accountId,
        stock_id: stock.id,
        side: input.side,
        type: "LIMIT",
        quantity: input.qty,
        remaining_quantity: input.qty,
        limit_price: input.limitPrice!,
        executed_price: null,
        status: "OPEN",
      },
    });
    log.info({ orderId: order.id }, "limit order resting in book");
    metrics.inc("orders_queued");
    await publishAccountUpdate(input.accountId, "order", order);
    return { status: "OPEN", orderId: order.id, message: "Limit order queued", executedQty: 0, fills: [] };
  }

  const computed = computeExecutionPrice({ side: input.side, qty: input.qty, quote, slippageCurve });
  const { price } = effectiveFillPrice(input.side, input.limitPrice, computed);

  const result = await createAndFill({
    accountId: input.accountId,
    stockId: stock.id,
    symbol: input.symbol,
    side: input.side,
    type: input.type,
    qty: input.qty,
    limitPrice: input.limitPrice,
    price,
  });

  metrics.inc("orders_filled");
  metrics.observeFillLatency(performance.now() - startedAt);
  await publishAccountUpdate(input.accountId, "portfolio", { accountId: input.accountId });
  const fee = result.fin.fee;
  return {
    status: "FILLED",
    orderId: result.order.id,
    executedQty: result.fin.fillQty,
    price: result.fin.notional > 0 ? round2(result.fin.notional / result.fin.fillQty) : price,
    fee,
    fills: [{ price, qty: result.fin.fillQty, fee }] satisfies FillResultRow[],
    order: result.order,
  };
}

/** Cancel an OPEN / PARTIALLY_FILLED order, releasing its remaining exposure. */
export async function cancelOrder(accountId: string, orderId: string) {
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("Order not found", 404, "ORDER_NOT_FOUND");
  if (order.account_id !== accountId) throw new OrderError("Forbidden", 403, "FORBIDDEN");
  if (!["OPEN", "PENDING", "PARTIALLY_FILLED"].includes(order.status)) {
    throw new OrderError(`Cannot cancel an order in status ${order.status}`, 400, "BAD_ORDER_STATE");
  }
  const updated = await prisma.orders.update({
    where: { id: orderId },
    data: { status: "CANCELLED", remaining_quantity: 0 },
  });
  await publishAccountUpdate(accountId, "order", updated);
  return updated;
}

export async function listAccountOrders(accountId: string, limit = 100) {
  return prisma.orders.findMany({
    where: { account_id: accountId },
    orderBy: { created_at: "desc" },
    take: limit,
    include: { stock: true },
  });
}

/** Orders resting in the book awaiting a price cross. */
export async function getOpenLimitOrders() {
  return prisma.orders.findMany({
    where: { OR: [{ status: "OPEN" }, { status: "PARTIALLY_FILLED" }], remaining_quantity: { gt: 0 } },
    orderBy: { created_at: "asc" },
  });
}

// Re-exported for tests / instrumentation.
export { logger };