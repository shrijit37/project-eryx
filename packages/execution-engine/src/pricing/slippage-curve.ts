export interface SlippageInput {
  side: "BUY" | "SELL";
  qty: number;
  marketPrice: number;
}

export interface SlippageResult {
  effectivePrice: number;
  slippagePct: number;
}

export class SlippageCurve {
  private readonly tiers: { maxQty: number; slippagePct: number }[];

  constructor(
    tiers?: { maxQty: number; slippagePct: number }[]
  ) {
    this.tiers = tiers ?? [
      { maxQty: 100, slippagePct: 0.001 },
      { maxQty: 10000, slippagePct: 0.005 },
      { maxQty: Infinity, slippagePct: 0.02 },
    ];
  }

  compute(input: SlippageInput): SlippageResult {
    const fallback = this.tiers[this.tiers.length - 1] as { maxQty: number; slippagePct: number };
    const slippagePct = (this.tiers.find((t) => input.qty <= t.maxQty) ?? fallback).slippagePct;

    const direction = input.side === "BUY" ? 1 : -1;
    const effectivePrice = input.marketPrice * (1 + direction * slippagePct);

    return { effectivePrice, slippagePct };
  }
}
