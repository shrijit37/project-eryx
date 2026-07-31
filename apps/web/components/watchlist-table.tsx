"use client";

import React, { useState } from "react";
import { StockMarketData } from "@/lib/useMarketData";
import { Sparkline } from "./sparkline";
import { TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";
import { cn } from "../lib/utils";

interface WatchlistTableProps {
  stocks: StockMarketData[];
  selectedSymbol: string | null;
  onSelectStock: (symbol: string) => void;
}

type SortField = "symbol" | "ltp" | "changePercent" | "bid" | "ask" | "spread";

export const WatchlistTable: React.FC<WatchlistTableProps> = ({
  stocks,
  selectedSymbol,
  onSelectStock,
}) => {
  const [sortField, setSortField] = useState<SortField>("symbol");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const sortedStocks = [...stocks].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortField) {
      case "symbol":
        aVal = a.symbol;
        bVal = b.symbol;
        break;
      case "ltp":
        aVal = a.ltp;
        bVal = b.ltp;
        break;
      case "changePercent":
        aVal = a.changePercent;
        bVal = b.changePercent;
        break;
      case "bid":
        aVal = a.bid;
        bVal = b.bid;
        break;
      case "ask":
        aVal = a.ask;
        bVal = b.ask;
        break;
      case "spread":
        aVal = a.ask - a.bid;
        bVal = b.ask - b.bid;
        break;
    }

    if (typeof aVal === "string") {
      return sortOrder === "asc"
        ? aVal.localeCompare(bVal as string)
        : (bVal as string).localeCompare(aVal);
    }
    return sortOrder === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  return (
    <div className={cn('w-full', 'overflow-x-auto', 'rounded-xl', 'border', 'border-slate-800', 'bg-slate-900/60', 'backdrop-blur-sm')}>
      <table className={cn('w-full', 'text-left', 'border-collapse', 'font-mono', 'text-xs')}>
        <thead>
          <tr className={cn('border-b', 'border-slate-800', 'bg-slate-950/80', 'text-slate-400')}>
            <th
              onClick={() => handleSort("symbol")}
              className={cn('py-3', 'px-4', 'cursor-pointer', 'hover:text-slate-200')}
            >
              <div className={cn('flex', 'items-center', 'gap-1')}>
                SYMBOL / COMPANY <ArrowUpDown className={cn('w-3', 'h-3', 'text-slate-500')} />
              </div>
            </th>
            <th
              onClick={() => handleSort("ltp")}
              className={cn('py-3', 'px-4', 'cursor-pointer', 'hover:text-slate-200', 'text-right')}
            >
              <div className={cn('flex', 'items-center', 'justify-end', 'gap-1')}>
                LTP ($) <ArrowUpDown className={cn('w-3', 'h-3', 'text-slate-500')} />
              </div>
            </th>
            <th
              onClick={() => handleSort("changePercent")}
              className={cn('py-3', 'px-4', 'cursor-pointer', 'hover:text-slate-200', 'text-right')}
            >
              <div className={cn('flex', 'items-center', 'justify-end', 'gap-1')}>
                CHANGE % <ArrowUpDown className={cn('w-3', 'h-3', 'text-slate-500')} />
              </div>
            </th>
            <th
              onClick={() => handleSort("bid")}
              className={cn('py-3', 'px-4', 'cursor-pointer', 'hover:text-slate-200', 'text-right', 'hidden', 'sm:table-cell')}
            >
              BID
            </th>
            <th
              onClick={() => handleSort("ask")}
              className={cn('py-3', 'px-4', 'cursor-pointer', 'hover:text-slate-200', 'text-right', 'hidden', 'sm:table-cell')}
            >
              ASK
            </th>
            <th
              onClick={() => handleSort("spread")}
              className={cn('py-3', 'px-4', 'cursor-pointer', 'hover:text-slate-200', 'text-right', 'hidden', 'md:table-cell')}
            >
              SPREAD
            </th>
            <th className={cn('py-3', 'px-4', 'text-center', 'hidden', 'md:table-cell')}>24H TICK TREND</th>
            <th className={cn('py-3', 'px-4', 'text-center', 'hidden', 'lg:table-cell')}>STATE</th>
          </tr>
        </thead>
        <tbody className={cn('divide-y', 'divide-slate-800/60', 'text-slate-200')}>
          {sortedStocks.map((stock) => {
            const isUp = stock.change >= 0;
            const isSelected = selectedSymbol === stock.symbol;
            const isFlashUp = stock.direction === "up";
            const isFlashDown = stock.direction === "down";
            const spread = +(stock.ask - stock.bid).toFixed(2);

            return (
              <tr
                key={stock.symbol}
                onClick={() => onSelectStock(stock.symbol)}
                className={`cursor-pointer transition-colors hover:bg-slate-800/50 ${isSelected
                    ? "bg-slate-800/80 border-l-4 border-l-cyan-400"
                    : isFlashUp
                      ? "bg-emerald-950/40"
                      : isFlashDown
                        ? "bg-rose-950/40"
                        : ""
                  }`}
              >
                {/* Symbol & Name */}
                <td className={cn('py-3', 'px-4')}>
                  <div className={cn('flex', 'items-center', 'gap-2')}>
                    <span className={cn('font-bold', 'text-slate-100')}>{stock.symbol}</span>
                    <span className={cn('text-[10px]', 'px-1', 'py-0.2', 'rounded', 'bg-slate-800', 'text-slate-400', 'border', 'border-slate-700')}>
                      {stock.exchange}
                    </span>
                  </div>
                  <div className={cn('text-[11px]', 'text-slate-400', 'truncate', 'max-w-[150px]')}>
                    {stock.name}
                  </div>
                </td>

                {/* LTP */}
                <td className={cn('py-3', 'px-4', 'text-right', 'font-bold', 'text-sm', 'text-slate-100')}>
                  ${stock.ltp.toFixed(2)}
                </td>

                {/* Change % */}
                <td className={cn('py-3', 'px-4', 'text-right')}>
                  <div
                    className={`inline-flex items-center gap-1 font-semibold ${isUp ? "text-emerald-400" : "text-rose-400"
                      }`}
                  >
                    {isUp ? <TrendingUp className={cn('w-3.5', 'h-3.5')} /> : <TrendingDown className={cn('w-3.5', 'h-3.5')} />}
                    <span>
                      {isUp ? "+" : ""}
                      {stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </td>

                {/* Bid */}
                <td className={cn('py-3', 'px-4', 'text-right', 'text-slate-300', 'hidden', 'sm:table-cell')}>
                  ${stock.bid.toFixed(2)}
                </td>

                {/* Ask */}
                <td className={cn('py-3', 'px-4', 'text-right', 'text-slate-300', 'hidden', 'sm:table-cell')}>
                  ${stock.ask.toFixed(2)}
                </td>

                {/* Spread */}
                <td className={cn('py-3', 'px-4', 'text-right', 'text-slate-400', 'hidden', 'md:table-cell')}>
                  ${spread}
                </td>

                {/* Sparkline Trend */}
                <td className={cn('py-2', 'px-4', 'text-center', 'hidden', 'md:table-cell')}>
                  <div className={cn('flex', 'justify-center')}>
                    <Sparkline history={stock.history} isUp={isUp} width={90} height={28} />
                  </div>
                </td>

                {/* Market State */}
                <td className={cn('py-3', 'px-4', 'text-center', 'hidden', 'lg:table-cell')}>
                  <span className={cn('text-[10px]', 'uppercase', 'font-mono', 'px-2', 'py-0.5', 'rounded', 'bg-slate-950', 'border', 'border-slate-800', 'text-slate-400')}>
                    {stock.marketState}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
