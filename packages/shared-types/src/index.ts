export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus =
  | "PENDING"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";
export type LedgerType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "FEE";
export type AccountType = "USER" | "AGENTIC";
export type AccountStatus = "ACTIVE" | "SUSPEND" | "CLOSED";

export interface MarketPrice {
  symbol: string;
  bid: number;
  ask: number;
  ltp: number;
  timestamp: number;
}

export interface FillResult {
  price: number;
  qty: number;
  fees: number;
  slippagePct: number;
}

export interface ExecutionResult {
  fills: FillResult[];
  totalCost: number;
  totalFees: number;
  avgPrice: number;
  slippageApplied: number;
}
