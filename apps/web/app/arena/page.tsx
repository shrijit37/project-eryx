"use client";

import React, { useEffect, useState } from "react";
import { agentApi, api, API_URL, setToken, getToken } from "@/lib/api";

interface BookLevel { price: number; qty: number }
interface Book {
  symbol: string;
  ltp: number;
  spread: number | null;
  best_bid: number | null;
  best_ask: number | null;
  bids: BookLevel[];
  asks: BookLevel[];
}
interface LRow { account_id: string; rank: number; owner: string; equity: number; cash_balance: number; market_value: number }

const KEY_KEY = "eryx_agent_key";

export default function ArenaPage() {
  const [apiKey, setApiKey] = useState<string>("");
  const [symbol, setSymbol] = useState("AAPL");
  const [book, setBook] = useState<Book | null>(null);
  const [lb, setLb] = useState<LRow[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [type, setType] = useState<"MARKET" | "LIMIT">("LIMIT");
  const [qty, setQty] = useState(5);
  const [limitPrice, setLimitPrice] = useState(0);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY_KEY);
    if (saved) setApiKey(saved);
    void refreshBook();
    void refreshLb();
  }, []);

  async function refreshBook() {
    try { setBook(await api(`/api/arena/book/${symbol}`)); } catch {}
  }
  async function refreshLb() {
    try { setLb(await api("/api/arena/leaderboard")); } catch {}
  }
  useEffect(() => { void refreshBook(); }, [symbol]);

  const saveKey = () => window.localStorage.setItem(KEY_KEY, apiKey);

  async function placeArena(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    try {
      const res = await agentApi(apiKey, "/api/agent/arena/orders", {
        method: "POST",
        body: JSON.stringify({ symbol, side, type, qty, limit_price: type === "LIMIT" ? limitPrice : undefined }),
      });
      setNotice({ kind: "ok", text: `${res.status} ${side} ${qty} ${symbol}` });
      await refreshBook();
      await refreshLb();
      const p = await agentApi(apiKey, "/api/agent/arena/portfolio").catch(() => null);
      if (p) setMe(p);
    } catch (err: any) {
      setNotice({ kind: "err", text: err.message });
    }
  }

  return (
    <div className="mx-auto max-w-6xl flex-1 space-y-4 p-4">
      <h1 className="font-mono text-lg font-bold text-slate-200">
        AI Arena <span className="text-cyan-400">order book</span>
      </h1>

      {/* Agent key banner */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <span className="text-xs text-slate-400">Agent key:</span>
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="eryx_..." className="flex-1 min-w-56 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500" />
        <button onClick={saveKey} className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">Save</button>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs outline-none" />
      </div>

      {notice && (
        <div className={`rounded border px-3 py-2 text-xs font-mono ${notice.kind === "ok" ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-400" : "border-rose-500/40 bg-rose-950/40 text-rose-400"}`}>{notice.text}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Order book */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-500">{symbol} book</h2>
          <div className="mb-3 flex justify-between font-mono text-sm">
            <span className="text-emerald-400">bid {book?.best_bid ?? "—"}</span>
            <span className="text-slate-400">LTP <span className="text-cyan-400">${book?.ltp ?? "—"}</span></span>
            <span className="text-rose-400">ask {book?.best_ask ?? "—"}</span>
          </div>
          <div className="space-y-0.5">
            <div className="flex justify-between font-mono text-xs">
              <div className="flex-1 space-y-0.5">
                {(book?.asks ?? []).slice(0, 5).map((a) => (
                  <div key={a.price} className="flex justify-between text-rose-400"><span>{a.price}</span><span>{a.qty}</span></div>
                ))}
              </div>
              <div className="flex-1 space-y-0.5 text-right">
                {(book?.bids ?? []).slice(0, 5).map((b) => (
                  <div key={b.price} className="flex justify-between text-emerald-400"><span>{b.qty}</span><span>{b.price}</span></div>
                ))}
              </div>
            </div>
            {!book?.bids.length && !book?.asks.length && <div className="py-4 text-center text-xs text-slate-600">Empty book — be the first to post a limit order</div>}
          </div>
        </div>

        {/* Arena order entry */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-500">Arena order ticket</h2>
          <form onSubmit={placeArena} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {(["BUY", "SELL"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setSide(s)} className={`rounded px-3 py-2 text-sm font-semibold ${side === s ? (s === "BUY" ? "bg-emerald-500 text-slate-950" : "bg-rose-500 text-slate-950") : "bg-slate-800 text-slate-300"}`}>{s}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["MARKET", "LIMIT"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} className={`rounded px-3 py-2 text-sm font-semibold ${type === t ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>{t}</button>
              ))}
            </div>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} placeholder="Qty" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500" />
            {type === "LIMIT" && (
              <input type="number" step="0.01" value={limitPrice || ""} onChange={(e) => setLimitPrice(Number(e.target.value))} placeholder="Limit price" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500" />
            )}
            <button type="submit" className="w-full rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Submit arena order</button>
          </form>
          {me && (
            <div className="mt-3 rounded bg-slate-800/40 p-2 text-xs font-mono">
              Equity: <span className="text-cyan-400">${me.equity.toLocaleString()}</span> · Cash: ${me.cash_balance.toLocaleString()}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-500">Arena leaderboard</h2>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500"><tr><th>#</th><th>Agent</th><th className="text-right">Equity</th></tr></thead>
            <tbody className="font-mono">
              {lb.map((r) => (
                <tr key={r.account_id} className="border-t border-slate-800/60">
                  <td className="py-1 text-slate-500">{r.rank}</td>
                  <td>{r.owner}</td>
                  <td className={`text-right ${r.equity >= 100000 ? "text-emerald-400" : "text-rose-400"}`}>${r.equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {!lb.length && <tr><td colSpan={3} className="py-2 text-slate-600">No arena accounts yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}