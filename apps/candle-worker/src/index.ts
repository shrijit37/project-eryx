import { Redis } from "ioredis";
import { prisma } from "@project-eryx/db";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const TIMEFRAMES = [
  { name: "1m", sec: 60 },
  { name: "5m", sec: 300 },
  { name: "15m", sec: 900 },
  { name: "1h", sec: 3600 },
  { name: "1d", sec: 86400 },
] as const;

interface Candle {
  symbol: string;
  timeframe: string;
  bucket: number; // bucket start (ms epoch)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const open = new Map<string, Candle>(); // key: `${symbol}:${tf}`
let symbolToStockId = new Map<string, string>();

async function refreshInstruments(): Promise<void> {
  try {
    const stocks = await prisma.stocks.findMany({ where: { is_active: true }, select: { id: true, symbol: true } });
    symbolToStockId = new Map(stocks.map((s) => [s.symbol, s.id]));
  } catch (e) {
    console.error("[candle-worker] refreshInstruments failed:", e);
  }
}

function update(symbol: string, ltp: number, tsMs: number): void {
  if (!ltp || ltp <= 0) return;
  for (const tf of TIMEFRAMES) {
    const bucket = Math.floor(tsMs / (tf.sec * 1000)) * (tf.sec * 1000);
    const key = `${symbol}:${tf.name}`;
    const cur = open.get(key);
    if (!cur || cur.bucket !== bucket) {
      if (cur) flushCandle(cur);
      open.set(key, {
        symbol,
        timeframe: tf.name,
        bucket,
        open: ltp,
        high: ltp,
        low: ltp,
        close: ltp,
        volume: 1,
      });
    } else {
      cur.high = Math.max(cur.high, ltp);
      cur.low = Math.min(cur.low, ltp);
      cur.close = ltp;
      cur.volume += 1;
    }
  }
}

const pending: Candle[] = [];

function flushCandle(c: Candle): void {
  pending.push(c);
}

/** Persist finalized candles to the PriceHistory table (idempotent per slot). */
async function writeClosed(): Promise<void> {
  if (pending.length === 0) return;
  const batch = pending.splice(0, pending.length);
  const rows = batch
    .map((c) => {
      const stockId = symbolToStockId.get(c.symbol);
      if (!stockId) return null;
      return {
        stock_id: stockId,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: BigInt(c.volume),
        timestamp: new Date(c.bucket),
        timeframe: c.timeframe,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return;
  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        // Remove any previous row for the same slot, then insert — keeps the
        // worker idempotent across restarts and never duplicates a candle.
        await tx.priceHistory.deleteMany({
          where: { stock_id: row.stock_id, timeframe: row.timeframe, timestamp: new Date(row.timestamp) },
        });
      }
      await tx.priceHistory.createMany({ data: rows });
    });
    console.log(`[candle-worker] wrote ${rows.length} candles`);
  } catch (e) {
    console.error("[candle-worker] write failed:", e);
  }
}

/** Every tick interval, finalize candles whose bucket has closed. */
function finalizeDueCandles(nowMs: number): void {
  for (const [key, c] of open) {
    const tf = TIMEFRAMES.find((t) => t.name === c.timeframe)!;
    if (c.bucket + tf.sec * 1000 <= nowMs) {
      open.delete(key);
      flushCandle(c);
    }
  }
}

async function main(): Promise<void> {
  console.log("Starting candle-worker...");
  const sub = new Redis({ host: "localhost", port: 6379 });

  await sub.ping();
  await refreshInstruments();
  await sub.subscribe("prices");
  console.log("Candle-worker subscribed to `prices`.");

  sub.on("message", (_channel, message) => {
    try {
      const price = JSON.parse(message);
      const tsMs = Number(price.ts) * 1000; // worker publishes Unix seconds
      update(price.symbol, Number(price.ltp), tsMs);
    } catch {
      // ignore malformed messages
    }
  });

  // Flush closed candles to DB every 5s; refresh instrument map every 60s.
  setInterval(() => {
    finalizeDueCandles(Date.now());
    void writeClosed();
  }, 5_000);

  setInterval(() => void refreshInstruments(), 60_000);

  // Graceful shutdown.
  const shutdown = async () => {
    finalizeDueCandles(Date.now());
    await writeClosed();
    await prisma.$disconnect();
    sub.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
