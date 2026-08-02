/** Trading fees: flat 0.1% of notional (per the execution-engine MatchingEngine default). */
export const FEE_RATE = 0.001;

/** A quote older than this is considered stale — never fill against it. */
export const PRICE_MAX_AGE_MS = 60_000;

/** Default initial capital for a freshly-created account (paper trading). */
export const DEFAULT_INITIAL_CAPITAL = 100_000;

/** Env flag toggling market-hours enforcement (off by default so the sim is testable 24/7). */
export const MARKET_HOURS_REQUIRED =
  process.env.MARKET_HOURS_REQUIRED === "true";
