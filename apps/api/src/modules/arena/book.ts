import type { OrderSide } from "@project-eryx/shared-types";

export interface ArenaRestingOrder {
  orderId: string;
  accountId: string;
  side: OrderSide;
  price: number; // limit price
  qty: number;
  remaining: number;
  seq: number; // insertion order for price-time priority
}

/**
 * A single-symbol in-memory arena book (price-time priority).
 * Because arena matching is synchronous within the API process, this
 * structure is the single source of truth for resting arena orders.
 */
export class ArenaBook {
  bids: ArenaRestingOrder[] = []; // best (highest) first
  asks: ArenaRestingOrder[] = []; // best (lowest) first
  private seq = 0;

  add(order: Omit<ArenaRestingOrder, "seq">): void {
    const entry: ArenaRestingOrder = { ...order, seq: this.seq++ };
    if (order.side === "BUY") {
      this.bids.push(entry);
      this.bids.sort((a, b) => b.price - a.price || a.seq - b.seq);
    } else {
      this.asks.push(entry);
      this.asks.sort((a, b) => a.price - b.price || a.seq - b.seq);
    }
  }

  cancel(orderId: string): boolean {
    const before = this.bids.length + this.asks.length;
    this.bids = this.bids.filter((o) => o.orderId !== orderId);
    this.asks = this.asks.filter((o) => o.orderId !== orderId);
    return this.bids.length + this.asks.length !== before;
  }

  removeEntry(entry: ArenaRestingOrder): void {
    this.bids = this.bids.filter((o) => o !== entry && o.orderId !== entry.orderId);
    this.asks = this.asks.filter((o) => o !== entry && o.orderId !== entry.orderId);
  }

  snapshot(): { bids: ArenaRestingOrder[]; asks: ArenaRestingOrder[] } {
    return {
      bids: this.bids.map((o) => ({ ...o })),
      asks: this.asks.map((o) => ({ ...o })),
    };
  }
}
