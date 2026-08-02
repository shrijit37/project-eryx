import { Redis } from "ioredis";

export interface MarketPriceData {
  bid: number;
  ask: number;
  ltp: number;
  ts: number;
  market_state: string;
}

let redis: Redis | null = null;

/** Lazily-initialized singleton ioredis client for the API process. */
export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({ host: "localhost", port: 6379 });
    redis.on("error", (err) => console.error("[redis] error", err.message));
  }
  return redis;
}

/** Read the latest normalized quote for a symbol from the `price:{symbol}` hash. */
export async function getMarketPrice(symbol: string): Promise<MarketPriceData | null> {
  const data = await getRedis().hgetall(`price:${symbol}`);
  if (!data || Object.keys(data).length === 0) return null;

  return {
    bid: Number(data.bid ?? 0),
    ask: Number(data.ask ?? 0),
    ltp: Number(data.ltp ?? 0),
    ts: Number(data.ts ?? 0),
    market_state: String(data.market_state ?? ""),
  };
}

/**
 * Publish an account-scoped update for the WS gateway.
 * The gateway forwards these to the `account:{id}` Socket.IO room.
 */
export async function publishAccountUpdate(
  accountId: string,
  event: string,
  payload: unknown
): Promise<void> {
  await getRedis().publish(
    "updates",
    JSON.stringify({ accountId, event, payload, ts: Date.now() })
  );
}
