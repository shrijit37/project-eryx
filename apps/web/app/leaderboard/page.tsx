"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface PaperRow {
  account_id: string;
  rank: number;
  owner: string;
  account_type: string;
  cash_balance: number;
  market_value: number;
  equity: number;
  pnl: number;
  pnl_pct: number;
  net_deposits: number;
  positions_count: number;
}
interface ArenaRow {
  account_id: string;
  rank: number;
  owner: string;
  account_type: string;
  cash_balance: number;
  market_value: number;
  equity: number;
}

export default function LeaderboardPage() {
  const [paper, setPaper] = useState<PaperRow[]>([]);
  const [arena, setArena] = useState<ArenaRow[]>([]);

  useEffect(() => {
    api<PaperRow[]>("/api/leaderboard").then(setPaper).catch(() => {});
    api<ArenaRow[]>("/api/arena/leaderboard").then(setArena).catch(() => {});
  }, []);

  const cell = (v: number, fmt = true) =>
    fmt ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v;

  return (
    <div className="mx-auto max-w-6xl flex-1 space-y-6 p-4">
      <h1 className="font-mono text-lg font-bold text-slate-200">
        Leaderboards <span className="text-cyan-400">P&amp;L</span>
      </h1>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Paper trading */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-500">Paper trading</h2>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500"><tr><th>#</th><th>Account</th><th>Type</th><th className="text-right">Equity</th><th className="text-right">P&amp;L</th><th className="text-right">%</th></tr></thead>
            <tbody className="font-mono">
              {paper.map((r) => (
                <tr key={r.account_id} className="border-t border-slate-800/60">
                  <td className="py-1 text-slate-500">{r.rank}</td>
                  <td>{r.owner}</td>
                  <td className="text-slate-400">{r.account_type === "AGENTIC" ? "agent" : "user"}</td>
                  <td className="text-right text-slate-200">${cell(r.equity)}</td>
                  <td className={`text-right ${r.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{r.pnl >= 0 ? "+" : ""}{cell(r.pnl)}</td>
                  <td className={`text-right ${r.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{r.pnl_pct >= 0 ? "+" : ""}{cell(r.pnl_pct)}%</td>
                </tr>
              ))}
              {!paper.length && <tr><td colSpan={6} className="py-2 text-slate-600">No data</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Arena */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-500">AI Arena</h2>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500"><tr><th>#</th><th>Agent</th><th className="text-right">Equity</th><th className="text-right">Cash</th><th className="text-right">Positions</th></tr></thead>
            <tbody className="font-mono">
              {arena.map((r) => (
                <tr key={r.account_id} className="border-t border-slate-800/60">
                  <td className="py-1 text-slate-500">{r.rank}</td>
                  <td>{r.owner}</td>
                  <td className={`text-right ${r.equity >= 100000 ? "text-emerald-400" : "text-rose-400"}`}>${cell(r.equity)}</td>
                  <td className="text-right text-slate-300">${cell(r.cash_balance)}</td>
                  <td className="text-right text-slate-400">${cell(r.market_value)}</td>
                </tr>
              ))}
              {!arena.length && <tr><td colSpan={5} className="py-2 text-slate-600">No arena accounts yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}