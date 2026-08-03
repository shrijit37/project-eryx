import { prisma } from "@project-eryx/db";
import { getRedis } from "../../lib/redis";
import { childLogger } from "../../lib/logger";

const log = childLogger("leaderboard");
const CACHE_TTL_S = 30;

export interface LeaderboardRow {
  rank: number;
  account_id: string;
  owner: { type: "user" | "agent"; name: string };
  account_type: string;
  cash_balance: number;
  market_value: number;
  equity: number;
  net_deposits: number;
  pnl: number;
  pnl_pct: number;
  positions_count: number;
}

/** Net initial capital = all DEPOSIT minus all WITHDRAWAL ledger entries. */
async function netDepositsByAccount(accountIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.cashLedger.findMany({
    where: { account_id: { in: accountIds }, type: { in: ["DEPOSIT", "WITHDRAWAL"] } },
    select: { account_id: true, type: true, amount: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const sign = r.type === "DEPOSIT" ? 1 : -1;
    map.set(r.account_id, (map.get(r.account_id) ?? 0) + Number(r.amount) * sign);
  }
  return map;
}

async function lastPrices(symbols: string[]): Promise<Map<string, number>> {
  const r = getRedis();
  const pipe = r.pipeline();
  for (const s of symbols) pipe.hgetall(`price:${s}`);
  const results = await pipe.exec();
  const map = new Map<string, number>();
  symbols.forEach((s, i) => {
    const data = results?.[i]?.[1] as Record<string, string> | undefined;
    map.set(s, data ? Number(data.ltp ?? 0) : 0);
  });
  return map;
}

/** Compute + cache the paper-trading leaderboard (P&L ranked). */
export async function getLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const r = getRedis();
  const cacheKey = "leaderboard:paper";
  const cached = await r.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as LeaderboardRow[];
    } catch {
      // fall through to recompute
    }
  }

  const accounts = await prisma.account.findMany({
    where: { status: "ACTIVE" },
    include: {
      user: { select: { username: true } },
      agent: { select: { name: true } },
      holdings: { where: { quantity: { gt: 0 } }, include: { stock: true } },
    },
  });

  const symbols = [...new Set(accounts.flatMap((a) => a.holdings.map((h) => h.stock.symbol)))];
  const prices = await lastPrices(symbols);
  const deposits = await netDepositsByAccount(accounts.map((a) => a.id));

  const rows: LeaderboardRow[] = accounts.map((a) => {
    let marketValue = 0;
    let positionsCount = 0;
    for (const h of a.holdings) {
      const ltp = prices.get(h.stock.symbol) || Number(h.stock.current_price) || 0;
      marketValue += Number(h.quantity) * ltp;
      positionsCount += 1;
    }
    const cash = Number(a.cash_balance);
    const equity = Math.round((cash + marketValue) * 100) / 100;
    const netDeposits = deposits.get(a.id) ?? 0;
    const pnl = Math.round((equity - netDeposits) * 100) / 100;
    const pnlPct = netDeposits > 0 ? Math.round((pnl / netDeposits) * 10000) / 100 : 0;
    return {
      rank: 0,
      account_id: a.id,
      owner: {
        type: a.agent ? "agent" : "user",
        name: a.agent?.name ?? a.user?.username ?? "anonymous",
      },
      account_type: a.account_type,
      cash_balance: cash,
      market_value: Math.round(marketValue * 100) / 100,
      equity,
      net_deposits: Math.round(netDeposits * 100) / 100,
      pnl,
      pnl_pct: pnlPct,
      positions_count: positionsCount,
    };
  });

  rows.sort((a, b) => b.pnl - a.pnl);
  rows.forEach((r, i) => (r.rank = i + 1));
  const top = rows.slice(0, limit);

  await r.set(cacheKey, JSON.stringify(top), "EX", CACHE_TTL_S);
  log.info({ count: top.length }, "leaderboard refreshed");
  return top;
}
