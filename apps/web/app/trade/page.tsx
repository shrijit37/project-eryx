"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";

interface Account {
  id: string;
  account_type: string;
  cash_balance: number;
  is_arena: boolean;
  status: string;
  currency: string;
}
interface Position {
  symbol: string;
  quantity: number;
  average_buy_price: number;
  last_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pnl: number;
}
interface Order {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  quantity: number;
  remaining_quantity: number;
  limit_price: number | null;
  executed_price: number | null;
  status: string;
  created_at: string;
}
interface Trade {
  id: string;
  stock: { symbol: string } | null;
  quantity: number;
  execution_price: number;
  executed_at: string;
}

const SIDES = ["BUY", "SELL"] as const;
const TYPES = ["MARKET", "LIMIT"] as const;

export default function TradePage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [detail, setDetail] = useState<{ cash_balance: number; equity: number; positions: Position[] } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  // Order form
  const [symbol, setSymbol] = useState("AAPL");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [type, setType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [qty, setQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState(0);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!getToken()) return router.push("/auth");
    setAuthed(true);
  }, [router]);

  const loadAccounts = useCallback(async () => {
    const list: Account[] = await api("/api/account");
    setAccounts(list);
    if (!accountId && list.length) setAccountId(list[0].id);
  }, [accountId]);

  useEffect(() => {
    if (authed) void loadAccounts();
  }, [authed, loadAccounts]);

  const loadEverything = useCallback(async () => {
    if (!accountId) return;
    const [d, o, t] = await Promise.all([
      api(`/api/account/${accountId}`),
      api(`/api/orders?account_id=${accountId}`),
      api(`/api/account/${accountId}/trades`),
    ]);
    setDetail(d);
    setOrders(o);
    setTrades(t);
  }, [accountId]);

  useEffect(() => {
    if (authed && accountId) void loadEverything();
  }, [authed, accountId, loadEverything]);

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      const res = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          account_id: accountId,
          symbol,
          side,
          type,
          qty,
          limit_price: type === "LIMIT" ? limitPrice : undefined,
        }),
      });
      setNotice({ kind: "ok", text: `${res.status} ${side} ${qty} ${symbol}` });
      await loadEverything();
    } catch (err: any) {
      setNotice({ kind: "err", text: err.message });
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      await api(`/api/orders/${accountId}/${orderId}/cancel`, { method: "POST" });
      await loadEverything();
    } catch (err: any) {
      setNotice({ kind: "err", text: err.message });
    }
  };

  if (!authed) return <div className="p-8 text-slate-400">Redirecting to sign-in…</div>;

  return (
    <div className="mx-auto max-w-6xl flex-1 space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg font-bold text-slate-200">
          Trade <span className="text-cyan-400">console</span>
        </h1>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_type} {a.is_arena ? "(arena)" : "(paper)"} · {a.currency}
            </option>
          ))}
        </select>
      </div>

      {notice && (
        <div
          className={`rounded border px-3 py-2 text-xs font-mono ${
            notice.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-400"
              : "border-rose-500/40 bg-rose-950/40 text-rose-400"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Order entry */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-slate-500">Order ticket</h2>
          <form onSubmit={placeOrder} className="space-y-2">
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500" />
            <div className="grid grid-cols-2 gap-2">
              {SIDES.map((s) => (
                <button key={s} type="button" onClick={() => setSide(s)} className={`rounded px-3 py-2 text-sm font-semibold ${side === s ? (s === "BUY" ? "bg-emerald-500 text-slate-950" : "bg-rose-500 text-slate-950") : "bg-slate-800 text-slate-300"}`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} className={`rounded px-3 py-2 text-sm font-semibold ${type === t ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>
                  {t}
                </button>
              ))}
            </div>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} placeholder="Qty" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500" />
            {type === "LIMIT" && (
              <input type="number" step="0.01" value={limitPrice || ""} onChange={(e) => setLimitPrice(Number(e.target.value))} placeholder="Limit price" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500" />
            )}
            <button type="submit" className="w-full rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
              Place {type} {side}
            </button>
          </form>
        </div>

        {/* Account summary + positions */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 lg:col-span-2">
          <div className="mb-3 flex gap-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500">Cash</div>
              <div className="font-mono text-2xl text-slate-100">${(detail?.cash_balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500">Equity</div>
              <div className="font-mono text-2xl text-cyan-400">${(detail?.equity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            </div>
          </div>
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-500">Positions</h3>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr><th className="pb-1">Symbol</th><th>Qty</th><th>Avg</th><th>Last</th><th>Value</th><th className="text-right">U/P&amp;L</th></tr>
            </thead>
            <tbody className="font-mono">
              {detail?.positions.map((p) => (
                <tr key={p.symbol} className="border-t border-slate-800/60">
                  <td className="py-1 text-slate-200">{p.symbol}</td>
                  <td>{p.quantity}</td>
                  <td>{p.average_buy_price.toFixed(2)}</td>
                  <td>{p.last_price.toFixed(2)}</td>
                  <td>${p.market_value.toFixed(2)}</td>
                  <td className={`text-right ${p.unrealized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{p.unrealized_pnl >= 0 ? "+" : ""}{p.unrealized_pnl.toFixed(2)}</td>
                </tr>
              ))}
              {!detail?.positions.length && <tr><td colSpan={6} className="py-2 text-slate-600">No positions</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Open orders */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-500">Orders</h2>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500"><tr><th>Sym</th><th>Side</th><th>Type</th><th>Qty</th><th>Rem</th><th>Lim</th><th>Status</th><th></th></tr></thead>
            <tbody className="font-mono">
              {orders.slice(0, 20).map((o) => (
                <tr key={o.id} className="border-t border-slate-800/60">
                  <td className="py-1">{o.symbol}</td>
                  <td className={o.side === "BUY" ? "text-emerald-400" : "text-rose-400"}>{o.side}</td>
                  <td>{o.type}</td>
                  <td>{o.quantity}</td>
                  <td>{o.remaining_quantity}</td>
                  <td>{o.limit_price ?? "—"}</td>
                  <td>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                      o.status === "FILLED" ? "bg-emerald-950 text-emerald-400" :
                      o.status === "OPEN" || o.status === "PARTIALLY_FILLED" ? "bg-amber-950 text-amber-400" :
                      o.status === "CANCELLED" ? "bg-slate-800 text-slate-400" : "bg-rose-950 text-rose-400"
                    }`}>{o.status}</span>
                  </td>
                  <td>
                    {["OPEN", "PARTIALLY_FILLED", "PENDING"].includes(o.status) && (
                      <button onClick={() => cancelOrder(o.id)} className="text-slate-500 hover:text-rose-400">✕</button>
                    )}
                  </td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan={8} className="py-2 text-slate-600">No orders</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Trade history */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-500">Trade history</h2>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500"><tr><th>Time</th><th>Sym</th><th>Qty</th><th>Price</th></tr></thead>
            <tbody className="font-mono">
              {trades.slice(0, 20).map((t) => (
                <tr key={t.id} className="border-t border-slate-800/60">
                  <td className="py-1 text-slate-400">{new Date(t.executed_at).toLocaleTimeString()}</td>
                  <td>{t.stock?.symbol ?? "?"}</td>
                  <td>{t.quantity}</td>
                  <td>{t.execution_price.toFixed(2)}</td>
                </tr>
              ))}
              {!trades.length && <tr><td colSpan={4} className="py-2 text-slate-600">No trades yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
