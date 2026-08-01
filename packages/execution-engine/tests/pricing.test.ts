import { test, expect, describe } from "bun:test";
import { SlippageCurve } from "../src/pricing/slippage-curve.js";
import { LiquidityTiers } from "../src/pricing/liquidity-tiers.js";
import { FeeModel } from "../src/pricing/fee-model.js";
import { computeExecutionPrice } from "../src/pricing/market-price.js";

describe("SlippageCurve", () => {
  const curve = new SlippageCurve();
  test("applies small slippage to retail size", () => {
    const r = curve.compute({ side: "BUY", qty: 10, marketPrice: 100 });
    expect(r.slippagePct).toBe(0.001);
    expect(r.effectivePrice).toBeCloseTo(100.1, 6);
  });
  test("sells below the reference", () => {
    const r = curve.compute({ side: "SELL", qty: 10, marketPrice: 100 });
    expect(r.effectivePrice).toBeCloseTo(99.9, 6);
  });
  test("escalates slippage for large size", () => {
    const r = curve.compute({ side: "BUY", qty: 50_000, marketPrice: 100 });
    expect(r.slippagePct).toBe(0.02);
  });
});

describe("LiquidityTiers", () => {
  const tiers = new LiquidityTiers();
  test("selects the correct tier by qty", () => {
    expect(tiers.getTier(50).label).toBe("retail");
    expect(tiers.getTier(5_000).label).toBe("medium");
    expect(tiers.getTier(500_000).label).toBe("large");
    expect(tiers.getTier(5_000_000).label).toBe("block");
  });
});

describe("FeeModel", () => {
  const fees = new FeeModel(0.001);
  test("computes 0.1% rounded to cents", () => {
    expect(fees.compute(2205.2)).toBeCloseTo(2.21, 2);
  });
});

describe("computeExecutionPrice", () => {
  const quote = { bid: 220.1, ask: 220.3, ltp: 220.29 };
  test("BUY fills at the ask without slippage", () => {
    const r = computeExecutionPrice({ side: "BUY", qty: 10, quote, applySlippage: false });
    expect(r.price).toBeCloseTo(220.3, 2);
  });
  test("BUY degrades above the ask with slippage", () => {
    const r = computeExecutionPrice({ side: "BUY", qty: 10, quote });
    expect(r.price).toBeGreaterThan(220.3);
  });
  test("SELL fills at the bid", () => {
    const r = computeExecutionPrice({ side: "SELL", qty: 10, quote, applySlippage: false });
    expect(r.price).toBeCloseTo(220.1, 2);
  });
});
