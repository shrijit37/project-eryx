"use client";

import React from "react";
import { Activity, Wifi, Radio, Zap, ShieldCheck } from "lucide-react";

interface HeaderProps {
  connectionStatus: "connected" | "connecting" | "disconnected" | "demo";
  isDemoMode: boolean;
  onToggleDemo: () => void;
  latencyMs: number;
  symbolCount: number;
}

export const TerminalHeader: React.FC<HeaderProps> = ({
  connectionStatus,
  isDemoMode,
  onToggleDemo,
  latencyMs,
  symbolCount,
}) => {
  const getStatusBadge = () => {
    switch (connectionStatus) {
      case "connected":
        return (
          <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 px-3 py-1 rounded-full text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>LIVE WS CONNECTED</span>
          </div>
        );
      case "connecting":
        return (
          <div className="flex items-center gap-2 bg-amber-950/60 border border-amber-500/40 text-amber-400 px-3 py-1 rounded-full text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>CONNECTING...</span>
          </div>
        );
      case "demo":
        return (
          <div className="flex items-center gap-2 bg-purple-950/60 border border-purple-500/40 text-purple-400 px-3 py-1 rounded-full text-xs font-mono">
            <Radio className="w-3.5 h-3.5 animate-pulse text-purple-400" />
            <span>DEMO SIMULATOR</span>
          </div>
        );
      case "disconnected":
      default:
        return (
          <div className="flex items-center gap-2 bg-rose-950/60 border border-rose-500/40 text-rose-400 px-3 py-1 rounded-full text-xs font-mono">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            <span>DISCONNECTED</span>
          </div>
        );
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Brand logo & Phase badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-blue-950/80 border border-blue-500/30 p-2 rounded-xl text-blue-400 shadow-lg shadow-blue-950/50">
            <Activity className="w-6 h-6 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-wider font-mono text-slate-100 flex items-center gap-2">
                ERYX <span className="text-xs text-cyan-400 bg-cyan-950/80 border border-cyan-800/50 px-2 py-0.5 rounded font-mono">TERMINAL v1.0</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Phase 1: Real-time Market Data Pipeline & Order Book Oracle
            </p>
          </div>
        </div>

        {/* Center/Right: Live Indicators & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Badge */}
          {getStatusBadge()}

          {/* Latency meter */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-400">
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
            <span>{latencyMs}ms</span>
          </div>

          {/* Watchlist Symbol Count */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-400">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span>{symbolCount} Symbols</span>
          </div>

          {/* Demo Mode Toggle Button */}
          <button
            onClick={onToggleDemo}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
              isDemoMode
                ? "bg-purple-900/40 text-purple-300 border-purple-500/50 hover:bg-purple-900/60 shadow-lg shadow-purple-950/50"
                : "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800"
            }`}
            title="Toggle between Live WebSocket Server and Frontend Demo Simulator"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>{isDemoMode ? "Mode: Demo Feed" : "Mode: Live WS"}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
