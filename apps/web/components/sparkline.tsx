"use client";

import React, { useId } from "react";
import { StockTick } from "@/lib/useMarketData";

interface SparklineProps {
  history: StockTick[];
  isUp: boolean;
  width?: number;
  height?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  history,
  isUp,
  width = 120,
  height = 36,
}) => {
  const reactId = useId();
  const strokeGradientId = `sparkline-gradient-${reactId.replace(/:/g, "")}`;

  if (!history || history.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-slate-600 font-mono"
        style={{ width, height }}
      >
        --
      </div>
    );
  }

  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = history
    .map((h, index) => {
      const x = (index / (history.length - 1)) * width;
      const y = height - ((h.price - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const color = isUp ? "#10b981" : "#f43f5e";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={strokeGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.0} />
        </linearGradient>
      </defs>

      {/* Polygon fill under path */}
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#${strokeGradientId})`}
      />

      {/* Line path */}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
