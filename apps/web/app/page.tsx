"use client";

import React, { useState } from "react";
import { useMarketData } from "@/lib/useMarketData";
import { TerminalHeader } from "@/components/header";
import { PriceTickerBar } from "@/components/price-ticker-bar";
import { WatchlistGrid } from "@/components/watchlist-grid";
import { WatchlistTable } from "@/components/watchlist-table";
import { StockDetailDrawer } from "@/components/stock-detail-drawer";
import { Search, LayoutGrid, Table, SlidersHorizontal, Activity, ArrowUpRight } from "lucide-react";

export default function Home() {
  const {
    stocks,
    connectionStatus,
    isDemoMode,
    setIsDemoMode,
    latencyMs,
    tickLogs,
    symbols,
  } = useMarketData();

  const [searchQuery, setSearchQuery] = useState("");
  const [exchangeFilter, setExchangeFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>("AAPL");

  // Filter stocks by search query and exchange
  const stockList = Object.values(stocks);
  const filteredStocks = stockList.filter((stock) => {
    const matchesSearch =
      stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesExchange =
      exchangeFilter === "ALL" || stock.exchange === exchangeFilter;

    return matchesSearch && matchesExchange;
  });

  const selectedStockData = selectedSymbol ? stocks[selectedSymbol] || null : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Top Header */}
      <TerminalHeader
        connectionStatus={connectionStatus}
        isDemoMode={isDemoMode}
        onToggleDemo={() => setIsDemoMode(!isDemoMode)}
        latencyMs={latencyMs}
        symbolCount={symbols.length}
      />

      {/* Top Streaming Price Marquee Bar */}
      <PriceTickerBar stocks={stocks} onSelectStock={(sym) => setSelectedSymbol(sym)} />

      {/* Main Content Body */}
      <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1600px] w-full mx-auto space-y-6">
        {/* Controls Bar: Search, Filters & View Toggle */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-slate-800">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search symbol (e.g. AAPL, NVDA, GOOG, BRK-A)..."
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Exchange Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <div className="text-xs font-mono text-slate-500 mr-1 flex items-center gap-1 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>EXCHANGE:</span>
            </div>
            {["ALL", "NASDAQ", "NYSE", "NSE"].map((ex) => (
              <button
                key={ex}
                onClick={() => setExchangeFilter(ex)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all border ${
                  exchangeFilter === ex
                    ? "bg-cyan-950 text-cyan-300 border-cyan-500/60 font-semibold"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                {ex}
              </button>
            ))}
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                viewMode === "grid"
                  ? "bg-slate-800 text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                viewMode === "table"
                  ? "bg-slate-800 text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>

        {/* Selected Stock Drawer / Focus Panel */}
        {selectedStockData && (
          <StockDetailDrawer
            stock={selectedStockData}
            tickLogs={tickLogs}
            onClose={() => setSelectedSymbol(null)}
          />
        )}

        {/* Watchlist Section Title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="text-lg font-bold font-mono text-slate-100 tracking-wide">
              MARKET WATCHLIST
            </h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
              Showing {filteredStocks.length} of {stockList.length}
            </span>
          </div>

          <div className="text-xs font-mono text-slate-500 hidden sm:block">
            Click any stock card to inspect live tick chart & order book depth
          </div>
        </div>

        {/* Watchlist View Container */}
        {viewMode === "grid" ? (
          <WatchlistGrid
            stocks={filteredStocks}
            selectedSymbol={selectedSymbol}
            onSelectStock={(sym) => setSelectedSymbol(sym)}
          />
        ) : (
          <WatchlistTable
            stocks={filteredStocks}
            selectedSymbol={selectedSymbol}
            onSelectStock={(sym) => setSelectedSymbol(sym)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-slate-950 py-4 px-4 lg:px-8">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span>Project Eryx &copy; 2026</span>
            <span>•</span>
            <span>Mock Stock Exchange / AI Agent Trading Simulator</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Level 1 Market Ingestor Ready
            </span>
            <a
              href="#"
              className="text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>Phase 1 Docs</span>
              <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
