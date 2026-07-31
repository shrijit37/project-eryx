"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export interface StockTick {
  price: number;
  ts: number;
}

export interface StockMarketData {
  symbol: string;
  name: string;
  exchange: string;
  bid: number;
  ask: number;
  ltp: number;
  prevLtp: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePercent: number;
  marketState: string;
  ts: number;
  direction: "up" | "down" | "flat";
  lastTickTime: number;
  history: StockTick[];
}

export interface TickLogItem {
  id: string;
  symbol: string;
  price: number;
  direction: "up" | "down" | "flat";
  ts: number;
}

const INITIAL_WATCHLIST: Array<{ symbol: string; name: string; exchange: string; basePrice: number }> = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", basePrice: 224.5 },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", basePrice: 118.2 },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ", basePrice: 428.9 },
  { symbol: "GOOG", name: "Alphabet Inc.", exchange: "NASDAQ", basePrice: 175.4 },
  { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ", basePrice: 182.4 },
  { symbol: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ", basePrice: 475.6 },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", basePrice: 219.8 },
  { symbol: "AVGO", name: "Broadcom Inc.", exchange: "NASDAQ", basePrice: 162.5 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", basePrice: 208.4 },
  { symbol: "WMT", name: "Walmart Inc.", exchange: "NYSE", basePrice: 68.2 },
  { symbol: "BRK-A", name: "Berkshire Hathaway Inc.", exchange: "NYSE", basePrice: 678400.0 },
  { symbol: "LLY", name: "Eli Lilly and Co.", exchange: "NYSE", basePrice: 942.5 },
  { symbol: "V", name: "Visa Inc.", exchange: "NYSE", basePrice: 268.4 },
  { symbol: "XOM", name: "Exxon Mobil Corp.", exchange: "NYSE", basePrice: 118.7 },
  { symbol: "JNJ", name: "Johnson & Johnson", exchange: "NYSE", basePrice: 154.2 },
  { symbol: "PG", name: "Procter & Gamble Co.", exchange: "NYSE", basePrice: 168.9 },
  { symbol: "MA", name: "Mastercard Inc.", exchange: "NYSE", basePrice: 452.3 },
  { symbol: "KO", name: "The Coca-Cola Co.", exchange: "NYSE", basePrice: 64.8 },
  { symbol: "HD", name: "The Home Depot Inc.", exchange: "NYSE", basePrice: 365.1 },
  { symbol: "NFLX", name: "Netflix Inc.", exchange: "NASDAQ", basePrice: 642.1 },
];

function generateInitialHistory(basePrice: number): StockTick[] {
  const history: StockTick[] = [];
  const now = Date.now();
  let price = basePrice;
  for (let i = 20; i >= 0; i--) {
    const delta = (Math.random() - 0.49) * (basePrice * 0.003);
    price = Math.max(0.01, +(price + delta).toFixed(2));
    history.push({
      price,
      ts: now - i * 3000,
    });
  }
  return history;
}

export function useMarketData() {
  const [stocks, setStocks] = useState<Record<string, StockMarketData>>(() => {
    const initialMap: Record<string, StockMarketData> = {};
    const now = Date.now();

    INITIAL_WATCHLIST.forEach((item) => {
      const history = generateInitialHistory(item.basePrice);
      const ltp = history[history.length - 1].price;
      const prevClose = item.basePrice * 0.992;
      const change = +(ltp - prevClose).toFixed(2);
      const changePercent = +((change / prevClose) * 100).toFixed(2);
      const spread = +(ltp * 0.0005).toFixed(2);

      initialMap[item.symbol] = {
        symbol: item.symbol,
        name: item.name,
        exchange: item.exchange,
        bid: +(ltp - spread / 2).toFixed(2),
        ask: +(ltp + spread / 2).toFixed(2),
        ltp,
        prevLtp: ltp,
        open: +(item.basePrice * 0.995).toFixed(2),
        high: +(ltp * 1.012).toFixed(2),
        low: +(ltp * 0.988).toFixed(2),
        prevClose: +prevClose.toFixed(2),
        change,
        changePercent,
        marketState: "REGULAR",
        ts: Math.floor(now / 1000),
        direction: "flat",
        lastTickTime: now,
        history,
      };
    });

    return initialMap;
  });

  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "disconnected" | "demo"
  >("connecting");
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number>(18);
  const [tickLogs, setTickLogs] = useState<TickLogItem[]>([]);

  const socketRef = useRef<Socket | null>(null);

  const addTickLog = useCallback((symbol: string, price: number, direction: "up" | "down" | "flat") => {
    setTickLogs((prev) => [
      {
        id: `log-${symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        symbol,
        price,
        direction,
        ts: Date.now(),
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const handlePriceUpdate = useCallback(
    (raw: { symbol: string; bid?: number | string; ask?: number | string; ltp?: number | string; market_state?: string; ts?: number }) => {
      if (!raw || !raw.symbol) return;

      const symbol = raw.symbol;
      const rawLtp = raw.ltp !== undefined && raw.ltp !== "" ? Number(raw.ltp) : null;
      const rawBid = raw.bid !== undefined && raw.bid !== "" ? Number(raw.bid) : null;
      const rawAsk = raw.ask !== undefined && raw.ask !== "" ? Number(raw.ask) : null;

      const now = Date.now();

      setStocks((prev) => {
        const existing = prev[symbol];
        const newLtp = rawLtp !== null && !isNaN(rawLtp) && rawLtp > 0 ? rawLtp : (existing ? existing.ltp : 100);

        if (!existing) {
          const spread = rawBid !== null && rawAsk !== null ? rawAsk - rawBid : newLtp * 0.0005;
          const bid = rawBid !== null && !isNaN(rawBid) ? rawBid : +(newLtp - spread / 2).toFixed(2);
          const ask = rawAsk !== null && !isNaN(rawAsk) ? rawAsk : +(newLtp + spread / 2).toFixed(2);
          const history = [{ price: newLtp, ts: now }];
          addTickLog(symbol, newLtp, "flat");

          return {
            ...prev,
            [symbol]: {
              symbol,
              name: symbol,
              exchange: symbol.endsWith(".NS") ? "NSE" : symbol.endsWith(".BO") ? "BSE" : "US",
              bid,
              ask,
              ltp: newLtp,
              prevLtp: newLtp,
              open: newLtp,
              high: newLtp,
              low: newLtp,
              prevClose: newLtp,
              change: 0,
              changePercent: 0,
              marketState: raw.market_state || "REGULAR",
              ts: raw.ts || Math.floor(now / 1000),
              direction: "flat",
              lastTickTime: now,
              history,
            },
          };
        }

        const prevLtp = existing.ltp;

        let direction: "up" | "down" | "flat" = "flat";
        if (newLtp > prevLtp) direction = "up";
        else if (newLtp < prevLtp) direction = "down";
        else direction = existing.direction;

        const spread = rawBid !== null && rawAsk !== null ? rawAsk - rawBid : newLtp * 0.0005;
        const bid = rawBid !== null && !isNaN(rawBid) ? rawBid : +(newLtp - spread / 2).toFixed(2);
        const ask = rawAsk !== null && !isNaN(rawAsk) ? rawAsk : +(newLtp + spread / 2).toFixed(2);

        const change = +(newLtp - existing.prevClose).toFixed(2);
        const changePercent = +((change / existing.prevClose) * 100).toFixed(2);

        const updatedHistory = [...existing.history, { price: newLtp, ts: now }].slice(-30);

        if (direction !== "flat") {
          addTickLog(symbol, newLtp, direction);
        }

        return {
          ...prev,
          [symbol]: {
            ...existing,
            bid,
            ask,
            ltp: newLtp,
            prevLtp,
            high: Math.max(existing.high, newLtp),
            low: Math.min(existing.low, newLtp),
            change,
            changePercent,
            marketState: raw.market_state || existing.marketState,
            ts: raw.ts || Math.floor(now / 1000),
            direction,
            lastTickTime: now,
            history: updatedHistory,
          },
        };
      });
    },
    [addTickLog]
  );

  // Connect Socket.IO
  useEffect(() => {
    if (isDemoMode) {
      setConnectionStatus("demo");
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4040";
    setConnectionStatus("connecting");

    const socket = io(wsUrl, {
      transports: ["websocket", "polling"],
      timeout: 4000,
      reconnectionAttempts: 3,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      // Subscribe to all symbols
      INITIAL_WATCHLIST.forEach((item) => {
        socket.emit("subscribe", item.symbol);
      });
    });

    socket.on("price", (data) => {
      handlePriceUpdate(data);
    });

    socket.on("connect_error", () => {
      setConnectionStatus("disconnected");
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isDemoMode, handlePriceUpdate]);

  // Demo mode ticker simulation (auto active when in demo mode or when backend is disconnected)
  useEffect(() => {
    if (!isDemoMode && connectionStatus === "connected") return;

    const interval = setInterval(() => {
      // Pick 2 random stocks to tick
      const symbols = Object.keys(stocks);
      const count = Math.floor(Math.random() * 2) + 1;
      for (let i = 0; i < count; i++) {
        const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
        const currentStock = stocks[randomSymbol];
        if (!currentStock) continue;

        const percentChange = (Math.random() - 0.495) * 0.008;
        const newLtp = Math.max(0.01, +(currentStock.ltp * (1 + percentChange)).toFixed(2));
        const spread = +(newLtp * 0.0006).toFixed(2);

        handlePriceUpdate({
          symbol: randomSymbol,
          bid: +(newLtp - spread / 2).toFixed(2),
          ask: +(newLtp + spread / 2).toFixed(2),
          ltp: newLtp,
          market_state: "REGULAR",
          ts: Math.floor(Date.now() / 1000),
        });
      }

      setLatencyMs(Math.floor(12 + Math.random() * 10));
    }, 1500);

    return () => clearInterval(interval);
  }, [isDemoMode, connectionStatus, stocks, handlePriceUpdate]);

  return {
    stocks,
    connectionStatus,
    isDemoMode,
    setIsDemoMode,
    latencyMs,
    tickLogs,
    symbols: Object.keys(stocks),
  };
}
