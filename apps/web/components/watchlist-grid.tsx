"use client";

import React from "react";
import { StockMarketData } from "@/lib/useMarketData";
import { Sparkline } from "./sparkline";
import { TrendingUp, TrendingDown, ChevronRight, Scale } from "lucide-react";

interface WatchlistGridProps {
  stocks: StockMarketData[];
  selectedSymbol: string | null;
  onSelectStock: (symbol: string) => void;
}

export const WatchlistGrid: React.FC<WatchlistGridProps> = ({
  stocks,
  selectedSymbol,
  onSelectStock,
}) => {
  if (stocks.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500 font-mono bg-slate-900/40 rounded-2xl border border-slate-800">
        No symbols match your filter.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {stocks.map((stock) => {
        const isUp = stock.change >= 0;
        const isSelected = selectedSymbol === stock.symbol;
        const isFlashUp = stock.direction === "up";
        const isFlashDown = stock.direction === "down";
        const spread = +(stock.ask - stock.bid).toFixed(2);

        return (
          <div
            key={stock.symbol}
            onClick={() => onSelectStock(stock.symbol)}
            className={`group relative p-4 rounded-xl border transition-all cursor-pointer bg-slate-900/70 backdrop-blur-sm hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-950/20 ${
              isSelected
                ? "border-cyan-500 ring-1 ring-cyan-500/50 bg-slate-900"
                : isFlashUp
                ? "border-emerald-500/60 bg-emerald-950/20"
                : isFlashDown
                ? "border-rose-500/60 bg-rose-950/20"
                : "border-slate-800/80"
            }`}
          >
            {/* Top row: Symbol & Exchange pill */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-mono font-bold text-lg text-slate-100 group-hover:text-cyan-300 transition-colors">
                    {stock.symbol}
                  </h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {stock.exchange}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate max-w-[160px]" title={stock.name}>
                  {stock.name}
                </p>
              </div>

              {/* Price Change % Badge */}
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                  isUp
                    ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/50"
                    : "bg-rose-950/80 text-rose-400 border border-rose-800/50"
                }`}
              >
                {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>
                  {isUp ? "+" : ""}
                  {stock.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Middle row: Live LTP & Sparkline */}
            <div className="flex items-baseline justify-between my-3">
              <div>
                <div className="text-2xl font-bold font-mono text-slate-100 tracking-tight flex items-baseline gap-1">
                  <span>${stock.ltp.toFixed(2)}</span>
                </div>
                <div className="text-xs font-mono text-slate-400 flex items-center gap-1">
                  <span>Change:</span>
                  <span className={isUp ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {isUp ? "+" : ""}
                    {stock.change.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Mini SVG Sparkline */}
              <div className="pt-1">
                <Sparkline history={stock.history} isUp={isUp} width={100} height={36} />
              </div>
            </div>

            {/* Bottom stats: Bid / Ask spread & High / Low */}
            <div className="pt-3 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/60">
                <div className="text-slate-500 flex items-center justify-between">
                  <span>BID / ASK</span>
                  <Scale className="w-2.5 h-2.5 text-slate-500" />
                </div>
                <div className="text-slate-300 font-medium mt-0.5 truncate">
                  ${stock.bid.toFixed(2)} / ${stock.ask.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Spread: ${spread}
                </div>
              </div>

              <div className="bg-slate-950/60 p-1.5 rounded border border-slate-800/60">
                <div className="text-slate-500 flex items-center justify-between">
                  <span>DAY RANGE</span>
                  <span className="text-[10px] text-cyan-400 uppercase">{stock.marketState}</span>
                </div>
                <div className="text-slate-300 font-medium mt-0.5 truncate">
                  ${stock.low.toFixed(2)} - ${stock.high.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Prev Close: ${stock.prevClose.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Hover arrow indicator */}
            <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
