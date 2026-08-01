export class FeeModel {
  constructor(private readonly rate: number = 0.001) {}

  /** Compute fee on a notional amount, rounded to cents. */
  compute(notional: number): number {
    return Math.round(notional * this.rate * 100) / 100;
  }
}
