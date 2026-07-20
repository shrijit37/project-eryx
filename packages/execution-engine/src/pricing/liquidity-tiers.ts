export interface LiquidityTier {
  maxQty: number;
  label: string;
}

export class LiquidityTiers {
  readonly tiers: LiquidityTier[];

  constructor() {
    this.tiers = [
      { maxQty: 100, label: "retail" },
      { maxQty: 10_000, label: "medium" },
      { maxQty: 1_000_000, label: "large" },
      { maxQty: Infinity, label: "block" },
    ];
  }

  getTier(qty: number): LiquidityTier {
    const last = this.tiers[this.tiers.length - 1] as LiquidityTier;
    return this.tiers.find((t) => qty <= t.maxQty) ?? last;
  }
}
