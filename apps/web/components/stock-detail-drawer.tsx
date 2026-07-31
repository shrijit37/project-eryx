"use client";

import React, { useState } from "react";
import { StockMarketData, TickLogItem } from "@/lib/useMarketData";
import { X, TrendingUp, TrendingDown, Clock, BarChart3, Radio } from "lucide-react";

interface StockDetailDrawerProps {
  stock: StockMarketData | null;
  tickLogs: TickLogItem[];
  onClose: () => void;
}

export const StockDetailDrawer: React.FC<StockDetailDrawerProps> = ({
  stock,
  tickLogs,
  onClose,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!stock) return null;

  const isUp = stock.change >= 0;
  const filteredLogs = tickLogs.filter((log) => log.symbol === stock.symbol);
  const spread = +(stock.ask - stock.bid).toFixed(2);

  // SVG Chart Calculation
  const history = stock.history;
  const width = 500;
  const height = 180;

  const prices = history.map((h) => h.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  const points = history.map((h, index) => {
    const x = (index / Math.max(1, history.length - 1)) * (width - 20) + 10;
    const y = height - 15 - ((h.price - minPrice) / range) * (height - 35);
    return { x, y, price: h.price, ts: h.ts };
  });

  const pathString = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const hoverPoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : points[points.length - 1];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-5">
      {/* Drawer Header */}
      <div className="flex items-start justify-between pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold font-mono text-slate-100">{stock.symbol}</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              {stock.exchange}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 uppercase">
              {stock.marketState}
            </span>
          </div>
          <p className="text-sm text-slate-400 font-medium mt-0.5">{stock.name}</p>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Price Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
        <div>
          <div className="text-xs text-slate-500 font-mono">LAST TRADED PRICE</div>
          <div className="text-3xl font-bold font-mono text-slate-100 mt-1 flex items-baseline gap-2">
            <span>${stock.ltp.toFixed(2)}</span>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 font-mono">TODAY'S CHANGE</div>
          <div
            className={`flex items-center gap-1 text-lg font-bold font-mono mt-1 ${
              isUp ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>
              {isUp ? "+" : ""}
              {stock.change.toFixed(2)} ({isUp ? "+" : ""}
              {stock.changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 font-mono">BID / ASK SPREAD</div>
          <div className="text-sm font-mono text-slate-300 mt-1 font-semibold">
            ${stock.bid.toFixed(2)} / ${stock.ask.toFixed(2)}
          </div>
          <div className="text-xs font-mono text-slate-500">Spread: ${spread}</div>
        </div>
      </div>

      {/* Real-time Tick Chart */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span>REALTIME TICK CHART</span>
          </div>

          {hoverPoint && (
            <div className="text-xs font-mono text-cyan-400 font-semibold">
              ${hoverPoint.price.toFixed(2)} @ {new Date(hoverPoint.ts).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* SVG Chart Container */}
        <div className="relative w-full h-[180px]">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full overflow-visible"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isUp ? "#10b981" : "#f43f5e"} stopOpacity={0.25} />
                <stop offset="100%" stopColor={isUp ? "#10b981" : "#f43f5e"} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            <line x1="10" y1="20" x2={width - 10} y2="20" stroke="#1e293b" strokeDasharray="3 3" />
            <line x1="10" y1={height / 2} x2={width - 10} y2={height / 2} stroke="#1e293b" strokeDasharray="3 3" />
            <line x1="10" y1={height - 20} x2={width - 10} y2={height - 20} stroke="#1e293b" strokeDasharray="3 3" />

            {/* Path fill */}
            <path
              d={`${pathString} L ${width - 10} ${height - 15} L 10 ${height - 15} Z`}
              fill="url(#chartFill)"
            />

            {/* Stroke Line */}
            <path
              d={pathString}
              fill="none"
              stroke={isUp ? "#10b981" : "#f43f5e"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Interactive Circles / Hover targets */}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={hoverIndex === i ? "5" : "3"}
                fill={hoverIndex === i ? "#38bdf8" : isUp ? "#10b981" : "#f43f5e"}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHoverIndex(i)}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* Grid: Order Book Depth Gauge & Tick Log Feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Order Book Depth Gauge */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs">
          <div className="text-slate-400 font-bold mb-3 flex items-center justify-between">
            <span>SYNTHETIC ORDER BOOK DEPTH</span>
            <span className="text-[10px] text-slate-500">LEVEL 1 TOUCH</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-emerald-400 font-semibold mb-1">
                <span>BEST BID</span>
                <span>${stock.bid.toFixed(2)}</span>
              </div>
              <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full w-[65%]"></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-rose-400 font-semibold mb-1">
                <span>BEST ASK</span>
                <span>${stock.ask.toFixed(2)}</span>
              </div>
              <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full w-[55%]"></div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-slate-400 text-[11px]">
              <div>
                <span className="text-slate-500">24H High:</span> ${stock.high.toFixed(2)}
              </div>
              <div>
                <span className="text-slate-500">24H Low:</span> ${stock.low.toFixed(2)}
              </div>
              <div>
                <span className="text-slate-500">Open:</span> ${stock.open.toFixed(2)}
              </div>
              <div>
                <span className="text-slate-500">Prev Close:</span> ${stock.prevClose.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Live WebSocket Tick Stream */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs">
          <div className="text-slate-400 font-bold mb-3 flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>WEBSOCKET TICK STREAM</span>
          </div>

          <div className="h-[140px] overflow-y-auto space-y-1.5 pr-1">
            {filteredLogs.length === 0 ? (
              <div className="text-slate-600 italic py-6 text-center">
                Waiting for incoming WebSocket ticks...
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between py-1 px-2 rounded bg-slate-900/80 border border-slate-800 text-[11px]"
                >
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400">
                      {new Date(log.ts).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">${log.price.toFixed(2)}</span>
                    <span
                      className={`font-semibold ${
                        log.direction === "up"
                          ? "text-emerald-400"
                          : log.direction === "down"
                          ? "text-rose-400"
                          : "text-slate-400"
                      }`}
                    >
                      {log.direction === "up" ? "▲ TICK UP" : "▼ TICK DOWN"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
