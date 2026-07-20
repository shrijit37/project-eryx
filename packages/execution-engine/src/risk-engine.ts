import type { OrderSide } from "@project-eryx/shared-types";

export interface RiskCheckInput {
  side: OrderSide;
  qty: number;
  price: number;
  cashBalance: number;
  positionQty: number;
  maxPositionSize: number;
}

export interface RiskCheckResult {
  approved: boolean;
  reasons: string[];
}

export class RiskEngine {
  check(input: RiskCheckInput): RiskCheckResult {
    const reasons: string[] = [];

    const estimatedCost = input.qty * input.price;

    if (input.side === "BUY" && estimatedCost > input.cashBalance) {
      reasons.push(
        `Insufficient cash: need ${estimatedCost}, have ${input.cashBalance}`
      );
    }

    if (input.side === "SELL" && input.qty > input.positionQty) {
      reasons.push(
        `Insufficient position: need ${input.qty}, have ${input.positionQty}`
      );
    }

    const newPosition =
      input.side === "BUY"
        ? input.positionQty + input.qty
        : input.positionQty - input.qty;

    if (Math.abs(newPosition) > input.maxPositionSize) {
      reasons.push(
        `Position limit exceeded: ${Math.abs(newPosition)} > ${input.maxPositionSize}`
      );
    }

    return {
      approved: reasons.length === 0,
      reasons,
    };
  }
}
