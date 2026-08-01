import { test, expect, describe } from "bun:test";
import { OrderBook } from "../src/matching/order-book.js";
import { MatchingEngine } from "../src/matching/matching-engine.js";

describe("OrderBook", () => {
  test("sorts bids highest-first, asks lowest-first (price-time priority)", () => {
    const book = new OrderBook();
    book.addBid({ price: 99, qty: 1, orderId: "b1", timestamp: 2 });
    book.addBid({ price: 101, qty: 1, orderId: "b2", timestamp: 1 });
    book.addAsk({ price: 102, qty: 1, orderId: "a1", timestamp: 1 });
    book.addAsk({ price: 100, qty: 1, orderId: "a2", timestamp: 2 });

    expect(book.bestBid()?.price).toBe(101);
    expect(book.bestAsk()?.price).toBe(100);
  });

  test("removes an order by id", () => {
    const book = new OrderBook();
    book.addBid({ price: 100, qty: 1, orderId: "b1", timestamp: 1 });
    book.remove("b1");
    expect(book.bestBid()).toBeUndefined();
  });

  test("computes spread", () => {
    const book = new OrderBook();
    book.addBid({ price: 100, qty: 1, orderId: "b1", timestamp: 1 });
    book.addAsk({ price: 101, qty: 1, orderId: "a1", timestamp: 1 });
    expect(book.spread()).toBe(1);
  });
});

describe("MatchingEngine", () => {
  test("a market buy sweeps resting asks at price-time priority", () => {
    const book = new OrderBook();
    book.addAsk({ price: 101, qty: 5, orderId: "a1", timestamp: 1 });
    book.addAsk({ price: 102, qty: 5, orderId: "a2", timestamp: 2 });

    const result = new MatchingEngine().match({ side: "BUY", qty: 7, orderBook: book });
    expect(result.avgPrice).toBeCloseTo((5 * 101 + 2 * 102) / 7, 6);
    expect(result.remainingQty).toBe(0);
    expect(result.fills).toHaveLength(2);
  });

  test("leaves an unfilled remainder when liquidity runs out", () => {
    const book = new OrderBook();
    book.addAsk({ price: 101, qty: 3, orderId: "a1", timestamp: 1 });
    const result = new MatchingEngine().match({ side: "BUY", qty: 10, orderBook: book });
    expect(result.remainingQty).toBe(7);
  });
});