import type { Request, Response } from "express";
import { prisma } from "@project-eryx/db";

const VALID_TIMEFRAMES = new Set(["1m", "5m", "15m", "1h", "1d"]);

async function getCandlesForSymbol(
  symbol: string,
  timeframe: string,
  limit: number,
  from?: number,
  to?: number
) {
  const stock = await prisma.stocks.findUnique({ where: { symbol } });
  if (!stock) return null;

  const where: Record<string, unknown> = {
    stock_id: stock.id,
    timeframe,
  };
  if (from !== undefined) where.timestamp = { ...((where.timestamp as object) ?? {}), gte: new Date(from) };
  if (to !== undefined) {
    const tsFilter = (where.timestamp as Record<string, Date>) ?? {};
    tsFilter.lte = new Date(to);
    where.timestamp = tsFilter;
  }

  const candles = await prisma.priceHistory.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return candles
    .reverse()
    .map((c) => ({
      symbol: stock.symbol,
      timeframe: c.timeframe,
      timestamp: c.timestamp.getTime(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: Number(c.volume),
    }));
}

export async function handleCandles(req: Request, res: Response) {
  try {
    const symbol = String(req.params.symbol).toUpperCase();
    const timeframe = String(req.query.timeframe ?? "1m");
    if (!VALID_TIMEFRAMES.has(timeframe)) {
      return res.status(400).json({ success: false, error: "Invalid timeframe", code: "BAD_TIMEFRAME" });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
    const from = req.query.from ? Number(req.query.from) : undefined;
    const to = req.query.to ? Number(req.query.to) : undefined;

    const data = await getCandlesForSymbol(symbol, timeframe, limit, from, to);
    if (data === null) {
      return res.status(404).json({ success: false, error: "Unknown symbol", code: "SYMBOL_NOT_FOUND" });
    }
    return res.json({ success: true, data });
  } catch (e) {
    console.error("[candles]", e);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export { getCandlesForSymbol };
