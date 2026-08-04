"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getToken, clearToken } from "@/lib/api";
import { LayoutDashboard, CandlestickChart, Trophy, Bot, LogOut } from "lucide-react";

const links = [
  { href: "/", label: "Market", icon: LayoutDashboard },
  { href: "/trade", label: "Trade", icon: CandlestickChart },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/arena", label: "Arena", icon: Trophy },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(getToken()));
  }, []);

  const logout = () => {
    clearToken();
    setAuthed(false);
    router.push("/auth");
  };

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-1 border-b border-slate-800 bg-slate-950/90 px-4 py-2 backdrop-blur">
      <span className="mr-4 font-mono text-sm font-bold text-cyan-400">
        ERYX<span className="text-slate-500">/term</span>
      </span>
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-cyan-500/10 text-cyan-300"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
      <div className="ml-auto flex items-center gap-2">
        {authed ? (
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <LogOut size={14} /> Sign out
          </button>
        ) : (
          <Link
            href="/auth"
            className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
