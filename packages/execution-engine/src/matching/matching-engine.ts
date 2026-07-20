import type { OrderSide, FillResult } from "@project-eryx/shared-types";
import { OrderBook } from "./order-book.js";

export interface MatchInput {
  side: OrderSide;
  qty: number;
  orderBook: OrderBook;
}

export interface MatchResult {
  fills: FillResult[];
  remainingQty: number;
  avgPrice: number;
}

export class MatchingEngine {
  match(input: MatchInput): MatchResult {
    const fills: FillResult[] = [];
    let remaining = input.qty;

    const entries =
      input.side === "BUY" ? input.orderBook.asks : input.orderBook.bids;

    for (const entry of entries) {
      if (remaining <= 0) break;

      const fillQty = Math.min(remaining, entry.qty);
      fills.push({
        price: entry.price,
        qty: fillQty,
        fees: fillQty * entry.price * 0.001,
        slippagePct: 0,
      });
      remaining -= fillQty;
    }

    const totalCost = fills.reduce((sum, f) => sum + f.price * f.qty, 0);
    const totalQty = fills.reduce((sum, f) => sum + f.qty, 0);
    const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;

    return { fills, remainingQty: remaining, avgPrice };
  }
}
