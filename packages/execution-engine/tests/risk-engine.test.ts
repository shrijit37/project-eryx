import { test, expect, describe } from "bun:test";
import { RiskEngine } from "../src/risk-engine.js";

const engine = new RiskEngine();
const base = { side: "BUY" as const, qty: 10, price: 100, cashBalance: 5000, positionQty: 0, maxPositionSize: 1000 };

describe("RiskEngine", () => {
  test("approves a feasible buy", () => {
    const r = engine.check(base);
    expect(r.approved).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  test("rejects a buy exceeding cash", () => {
    const r = engine.check({ ...base, qty: 100, cashBalance: 500 });
    expect(r.approved).toBe(false);
    expect(r.reasons[0]).toMatch(/Insufficient cash/);
  });

  test("rejects a sell exceeding position", () => {
    const r = engine.check({ ...base, side: "SELL", qty: 50, positionQty: 10 });
    expect(r.approved).toBe(false);
    expect(r.reasons[0]).toMatch(/Insufficient position/);
  });

  test("enforces the position size limit", () => {
    // Cash is ample; only the position-limit check should trip.
    const r = engine.check({ ...base, qty: 200, price: 100, cashBalance: 100_000, maxPositionSize: 100 });
    expect(r.approved).toBe(false);
    expect(r.reasons.some((x) => x.includes("Position limit"))).toBe(true);
  });
});
