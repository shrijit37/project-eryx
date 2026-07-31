"use client";

import React from "react";
import { StockMarketData } from "@/lib/useMarketData";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PriceTickerBarProps {
  stocks: Record<string, StockMarketData>;
  onSelectStock: (symbol: string) => void;
}

export const PriceTickerBar: React.FC<PriceTickerBarProps> = ({ stocks, onSelectStock }) => {
  const stockList = Object.values(stocks);

  return (
    <div className="w-full bg-slate-950 border-b border-slate-800/80 py-2 px-4 overflow-x-auto whitespace-nowrap scrollbar-none flex items-center gap-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-semibold px-2 shrink-0 border-r border-slate-800 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
        TICKER FEED
      </div>

      <div className="flex items-center gap-3">
        {stockList.map((stock) => {
          const isUp = stock.change >= 0;
          const isFlashUp = stock.direction === "up";
          const isFlashDown = stock.direction === "down";

          return (
            <button
              key={stock.symbol}
              onClick={() => onSelectStock(stock.symbol)}
              className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-mono transition-all border shrink-0 hover:border-slate-600 ${
                isFlashUp
                  ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-300"
                  : isFlashDown
                  ? "bg-rose-950/60 border-rose-500/50 text-rose-300"
                  : "bg-slate-900/80 border-slate-800 text-slate-300"
              }`}
            >
              <span className="font-bold text-slate-100">{stock.symbol}</span>
              <span className="font-semibold text-slate-200">${stock.ltp.toFixed(2)}</span>
              <span
                className={`flex items-center gap-0.5 text-[11px] font-medium ${
                  isUp ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {isUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {isUp ? "+" : ""}
                {stock.changePercent.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
