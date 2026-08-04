"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, API_URL } from "@/lib/api";

interface AgentRow {
  id: string;
  name: string;
  description: string;
  strategy: string;
  model: string;
  has_api_key: boolean;
  created_at: string;
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) return router.push("/auth");
    void load();
  }, [router]);

  async function load() {
    setAgents(await api("/api/agents"));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setNewKey(null);
    setNotice(null);
    try {
      const res = await api("/api/agents", {
        method: "POST",
        body: JSON.stringify({ name, strategy, description: "" }),
      });
      setNewKey(res.api_key);
      setName("");
      setStrategy("");
      await load();
    } catch (err: any) {
      setNotice(err.message);
    }
  }

  async function rotate(id: string) {
    const res = await api(`/api/agents/${id}/rotate-key`, { method: "POST" });
    setNewKey(res.api_key);
    await load();
  }

  async function enableArena(id: string) {
    setNotice(null);
    try {
      await api("/api/arena/account", {
        method: "POST",
        body: JSON.stringify({ agent_id: id }),
      });
      setNotice("Arena account enabled for this agent (funded with $100k).");
    } catch (err: any) {
      setNotice(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl flex-1 space-y-4 p-4">
      <h1 className="font-mono text-lg font-bold text-slate-200">
        AI Agents <span className="text-cyan-400">console</span>
      </h1>
      <p className="text-xs text-slate-500">
        Create agents to obtain API keys for algorithmic trading (paper + AI Arena). Each agent gets a $100k account.
      </p>

      {newKey && (
        <div className="rounded border border-amber-500/40 bg-amber-950/40 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-300">API key — save it now, it will not be shown again:</p>
          <code className="break-all font-mono text-sm text-amber-100">{newKey}</code>
        </div>
      )}
      {notice && <div className="rounded border border-rose-500/40 bg-rose-950/40 p-2 text-xs text-rose-400">{notice}</div>}

      <form onSubmit={create} className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" className="flex-1 min-w-40 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500" />
        <input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Strategy (e.g. momentum)" className="flex-1 min-w-40 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500" />
        <button type="submit" className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Create</button>
      </form>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500"><tr><th>Name</th><th>Strategy</th><th>Key</th><th></th><th></th></tr></thead>
          <tbody className="font-mono">
            {agents.map((a) => (
              <tr key={a.id} className="border-t border-slate-800/60">
                <td className="py-2 text-slate-200">{a.name}</td>
                <td className="text-slate-400">{a.strategy || "—"}</td>
                <td>{a.has_api_key ? <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] text-emerald-400">active</span> : <span className="text-slate-600">—</span>}</td>
                <td><button onClick={() => enableArena(a.id)} className="text-slate-500 hover:text-cyan-400">Enable arena</button></td>
                <td><button onClick={() => rotate(a.id)} className="text-slate-500 hover:text-amber-400">Rotate key</button></td>
              </tr>
            ))}
            {!agents.length && <tr><td colSpan={4} className="py-2 text-slate-600">No agents yet</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-600">
        To trade the AI Arena: create an agent, copy its key into the Arena page, then use the arena ticket. (Arena accounts are created server-side per arena page usage.)
      </div>
    </div>
  );
}
