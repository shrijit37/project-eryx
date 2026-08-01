import type { OrderSide } from "@project-eryx/shared-types";
import { SlippageCurve } from "./slippage-curve.js";

export interface Quote {
  bid: number;
  ask: number;
  ltp: number;
}

export interface ExecutionPriceInput {
  side: OrderSide;
  qty: number;
  quote: Quote;
  slippageCurve?: SlippageCurve;
  /** Defaults to true; disable to fill exactly at the touch price (Phase 2 behavior). */
  applySlippage?: boolean;
}

export interface ExecutionPriceResult {
  /** Effective per-share fill price for the whole qty. */
  price: number;
  slippagePct: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the effective execution price for an order against a live quote.
 *
 * BUY fills at the ask (paying the offered price), SELL fills at the bid.
 * When a slippage curve is supplied, larger qty walks the book synthetically
 * and the fill degrades away from the touch price in the direction of the order.
 */
export function computeExecutionPrice(input: ExecutionPriceInput): ExecutionPriceResult {
  const { side, qty, quote } = input;
  const reference = side === "BUY" ? quote.ask : quote.bid;

  if (input.applySlippage === false) {
    return { price: round2(reference), slippagePct: 0 };
  }

  const curve = input.slippageCurve ?? new SlippageCurve();
  const result = curve.compute({ side, qty, marketPrice: reference });
  return { price: round2(result.effectivePrice), slippagePct: result.slippagePct };
}
