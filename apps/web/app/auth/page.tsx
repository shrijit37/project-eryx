"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, setToken } from "@/lib/api";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await fetch(`${API_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, username }),
        });
        const body = await res.json();
        if (!res.ok || body.success === false) throw new Error(body.message || body.error || "Registration failed");
      }
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok || body.success === false) throw new Error(body.message || "Login failed");
      setToken(body.token);
      router.push("/trade");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/60 p-8">
        <h1 className="mb-1 font-mono text-xl font-bold text-cyan-400">
          ERYX<span className="text-slate-500">/auth</span>
        </h1>
        <p className="mb-6 text-sm text-slate-400">Paper trading &amp; AI Arena console</p>

        <div className="mb-6 flex gap-1 rounded-lg bg-slate-800/60 p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                mode === m ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password (8-32 chars)"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          />
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {loading ? "..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          New accounts receive a <span className="text-cyan-400">funded $100,000 paper account</span>.
        </p>
      </div>
    </div>
  );
}