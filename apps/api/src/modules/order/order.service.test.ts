import { test, expect, describe } from "bun:test";
import { isMarketable, effectiveFillPrice } from "./order.service";

const quote = { bid: 220.1, ask: 220.3, ltp: 220.29 };

describe("isMarketable", () => {
  test("BUY is marketable when limit >= ask", () => {
    expect(isMarketable("BUY", 220.3, quote)).toBe(true);
    expect(isMarketable("BUY", 220.5, quote)).toBe(true);
  });
  test("BUY rests when limit < ask", () => {
    expect(isMarketable("BUY", 220.0, quote)).toBe(false);
  });
  test("SELL is marketable when limit <= bid", () => {
    expect(isMarketable("SELL", 220.1, quote)).toBe(true);
    expect(isMarketable("SELL", 219.9, quote)).toBe(true);
  });
  test("SELL rests when limit > bid", () => {
    expect(isMarketable("SELL", 220.5, quote)).toBe(false);
  });
});

describe("effectiveFillPrice", () => {
  test("caps a BUY at its limit (never pay more)", () => {
    const r = effectiveFillPrice("BUY", 220.4, { price: 220.45, slippagePct: 0.001 });
    expect(r.price).toBeCloseTo(220.4, 2);
  });
  test("floors a SELL at its limit (never receive less)", () => {
    const r = effectiveFillPrice("SELL", 219.9, { price: 219.85, slippagePct: 0.001 });
    expect(r.price).toBeCloseTo(219.9, 2);
  });
  test("market orders use the computed price", () => {
    const r = effectiveFillPrice("BUY", undefined, { price: 220.5, slippagePct: 0.001 });
    expect(r.price).toBeCloseTo(220.5, 2);
  });
});
