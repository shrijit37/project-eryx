"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getSession,
  signInWithEmail,
  signUpWithEmail,
  signInWithProviderRedirect,
} from "@/lib/auth-client";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSession().then(({ data }) => {
      if (data?.user) router.replace("/trade");
    });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "register") {
        const { data, error: err } = await signUpWithEmail({ email, password, name: email.split("@")[0] });
        if (err || !data) throw Object.assign(new Error(messageFor(err)), { code: err?.code });
        setNotice("Check your inbox to verify your email, then sign in.");
        setMode("login");
        return;
      }
      const { data, error: err } = await signInWithEmail({ email, password });
      if (err || !data) throw Object.assign(new Error(messageFor(err)), { code: err?.code });
      router.push("/trade");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const provider = async (provider: "google" | "github") => {
    setError(null);
    setLoading(true);
    const { error: err } = await signInWithProviderRedirect({ provider, callbackURL: "/trade" });
    if (err) {
      setError(err.message || "Provider sign-in failed");
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

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => provider("google")}
            disabled={loading}
            className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500 disabled:opacity-50"
          >
            Google
          </button>
          <button
            type="button"
            onClick={() => provider("github")}
            disabled={loading}
            className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500 disabled:opacity-50"
          >
            GitHub
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 text-[11px] text-slate-600">
          <span className="h-px flex-1 bg-slate-800" />
          or
          <span className="h-px flex-1 bg-slate-800" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="Email"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            placeholder="Password (8-32 chars)"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          />
          {notice && <p className="text-xs text-cyan-400">{notice}</p>}
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

function messageFor(err: { code?: string; message?: string } | null | undefined): string {
  switch (err?.code) {
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email first — check your inbox.";
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "That email is already registered. Try signing in.";
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Wrong email or password.";
    default:
      return err?.message || "Something went wrong";
  }
}