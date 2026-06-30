"use client";

import { useState, useEffect } from "react";

const TICKERS = ["RBLX", "MSFT", "TTWO", "COIN", "NVDA", "SONY"] as const;
type Ticker = (typeof TICKERS)[number];

interface StockData {
  ticker: Ticker;
  price: number | null;
  changePercent: number | null;
  loading: boolean;
  error: boolean;
}

export function TickerBar() {
  const [stocks, setStocks] = useState<StockData[]>(() =>
    TICKERS.map((ticker) => ({
      ticker,
      price: null,
      changePercent: null,
      loading: true,
      error: false,
    }))
  );

  const fetchStock = async (ticker: Ticker): Promise<Pick<StockData, "price" | "changePercent">> => {
    try {
      const res = await fetch(`/api/stock/${ticker}?range=1d`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return {
        price: data.quote?.price ?? null,
        changePercent: data.quote?.changePercent ?? null,
      };
    } catch (error) {
      console.error(`Failed to fetch ${ticker}:`, error);
      return { price: null, changePercent: null };
    }
  };

  const fetchAll = async () => {
    const results = await Promise.allSettled(TICKERS.map((ticker) => fetchStock(ticker)));
    setStocks((prev) =>
      prev.map((stock, idx) => {
        const result = results[idx];
        if (result.status === "fulfilled") {
          const { price, changePercent } = result.value;
          return {
            ...stock,
            price,
            changePercent,
            loading: false,
            error: false,
          };
        } else {
          return {
            ...stock,
            loading: false,
            error: true,
          };
        }
      })
    );
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number | null) => {
    if (price === null) return "–";
    return `$${price.toFixed(2)}`;
  };

  const formatChangePercent = (change: number | null) => {
    if (change === null) return "–";
    const sign = change >= 0 ? "+" : "";
    const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "";
    return `${arrow}${sign}${change.toFixed(2)}%`;
  };

  return (
    <div className="hidden sm:flex items-center h-6 bg-ast-surface/60 border-b border-ast-border/40 font-mono">
      <div className="flex items-center h-full overflow-x-auto scrollbar-none">
        {stocks.map((stock, idx) => (
          <div
            key={stock.ticker}
            className="flex items-center h-full px-3 border-r border-ast-border/40 last:border-r-0"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-ast-text font-bold text-[10px] tracking-tight">
                {stock.ticker}
              </span>
              <span className="text-ast-muted text-[10px]">·</span>
              <span className="text-ast-text font-medium text-[10px]">
                {stock.loading ? "…" : formatPrice(stock.price)}
              </span>
              <span className="text-ast-muted text-[10px]">·</span>
              <span
                className={`font-medium text-[10px] ${
                  stock.error
                    ? "text-ast-muted"
                    : stock.changePercent && stock.changePercent >= 0
                    ? "text-ast-mint"
                    : stock.changePercent && stock.changePercent < 0
                    ? "text-ast-pink"
                    : "text-ast-muted"
                }`}
              >
                {stock.loading ? "…" : formatChangePercent(stock.changePercent)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}