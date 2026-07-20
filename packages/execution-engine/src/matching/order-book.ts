export interface OrderBookEntry {
  price: number;
  qty: number;
  orderId: string;
  timestamp: number;
}

export class OrderBook {
  bids: OrderBookEntry[] = [];
  asks: OrderBookEntry[] = [];

  addBid(entry: OrderBookEntry): void {
    this.bids.push(entry);
    this.bids.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
  }

  addAsk(entry: OrderBookEntry): void {
    this.asks.push(entry);
    this.asks.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
  }

  remove(orderId: string): void {
    this.bids = this.bids.filter((e) => e.orderId !== orderId);
    this.asks = this.asks.filter((e) => e.orderId !== orderId);
  }

  bestBid(): OrderBookEntry | undefined {
    return this.bids[0];
  }

  bestAsk(): OrderBookEntry | undefined {
    return this.asks[0];
  }

  spread(): number | undefined {
    const bb = this.bestBid();
    const ba = this.bestAsk();
    if (bb && ba) return ba.price - bb.price;
    return undefined;
  }
}
