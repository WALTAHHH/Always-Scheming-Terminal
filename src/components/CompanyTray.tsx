"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { findCompanyByName, type CompanyData } from "@/lib/companies";
import type { FeedItem } from "@/lib/database.types";
import { TimeAgo } from "./TimeAgo";

interface CompanyTrayProps {
  items: FeedItem[];
  selectedCompany: string | null;
  onSelectCompany: (name: string | null) => void;
}

type ChartRange = "1w" | "1mo" | "6mo" | "1y";
type IndexWeighting = "equal" | "mcap";

const RANGE_CONFIG: Record<ChartRange, { range: string; interval: string; label: string }> = {
  "1w": { range: "5d", interval: "1h", label: "1W" },
  "1mo": { range: "1mo", interval: "1d", label: "1M" },
  "6mo": { range: "6mo", interval: "1d", label: "6M" },
  "1y": { range: "1y", interval: "1wk", label: "1Y" },
};

// Curated baskets
const COMPANY_BASKETS: Record<string, string[]> = {
  "AS Index": [
    // AS Primitives Index — 13 companies across Input/Interface/Infra
    "Apple", "Coinbase", "Google", "Meta", "Microsoft", "Nvidia",
    "Roblox", "Samsung", "Snap", "Sony", "Take-Two Interactive", "Tencent", "Unity",
  ],
  "Western": [
    "Electronic Arts", "Take-Two Interactive", "Ubisoft", "CD Projekt", "Embracer Group", "Paradox Interactive",
  ],
  "Asian": [
    "Tencent", "NetEase", "Nexon", "Krafton", "Bandai Namco", "Capcom",
  ],
  "Mobile": [
    "AppLovin", "Playtika", "Roblox", "Sea Limited", "Tencent", "NetEase",
  ],
};

interface StockQuote {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketCap: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

interface StockHistory {
  date: string;
  close: number;
}

interface StockData {
  quote: StockQuote | null;
  history: StockHistory[];
  loading: boolean;
}

function formatCurrency(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
}

// Sparkline component
function Sparkline({ history, isPositive, height = 24 }: { history: StockHistory[]; isPositive: boolean; height?: number }) {
  if (history.length < 2) {
    return <div className="h-6 bg-ast-surface/30 rounded" />;
  }

  const prices = history.map((h) => h.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices.map((price, i) => {
    const x = (i / (prices.length - 1)) * 100;
    const y = 100 - ((price - min) / range) * 100;
    return `${x},${y}`;
  });

  const color = isPositive ? "#00d4aa" : "#ff6b8a";

  return (
    <div style={{ height }} className="w-full">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        <path 
          d={`M ${points.join(" L ")}`} 
          fill="none" 
          stroke={color} 
          strokeWidth="2" 
          vectorEffect="non-scaling-stroke" 
        />
      </svg>
    </div>
  );
}

// Full chart component
function MiniChart({ history, isPositive }: { history: StockHistory[]; isPositive: boolean }) {
  if (history.length < 2) {
    return (
      <div className="h-20 bg-ast-surface/50 rounded flex items-center justify-center">
        <span className="text-ast-muted text-[10px]">No chart data</span>
      </div>
    );
  }

  const prices = history.map((h) => h.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices.map((price, i) => {
    const x = 2 + (i / (prices.length - 1)) * 96;
    const y = 5 + 90 - ((price - min) / range) * 90;
    return `${x},${y}`;
  });

  const color = isPositive ? "#00d4aa" : "#ff6b8a";

  return (
    <div className="h-20 bg-ast-surface/50 rounded overflow-hidden">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        <path d={`M ${points.join(" L ")}`} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

// Company card with sparkline
function CompanyCard({ 
  name, 
  companyData,
  stockData,
  mentionCount,
  isExpanded,
  onClick,
}: { 
  name: string;
  companyData: CompanyData | null;
  stockData: StockData;
  mentionCount: number;
  isExpanded: boolean;
  onClick: () => void;
}) {
  const { quote, history, loading } = stockData;
  const isPositive = (quote?.change ?? 0) >= 0;
  
  return (
    <button
      onClick={onClick}
      className={`w-full p-2.5 rounded border text-left transition-all ${
        isExpanded 
          ? "border-ast-accent bg-ast-accent/5" 
          : "border-ast-border hover:border-ast-muted bg-ast-surface/50"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-ast-accent">
          {companyData?.ticker || name.slice(0, 6).toUpperCase()}
        </span>
        {loading ? (
          <span className="text-[10px] text-ast-muted animate-pulse">...</span>
        ) : quote ? (
          <span className={`text-xs font-semibold ${isPositive ? "text-ast-mint" : "text-ast-pink"}`}>
            {isPositive ? "▲" : "▼"}{Math.abs(quote.changePercent).toFixed(1)}%
          </span>
        ) : null}
      </div>
      
      {/* Price */}
      {quote && (
        <div className="text-sm font-medium text-ast-text mb-1">
          {formatCurrency(quote.price, quote.currency)}
        </div>
      )}
      
      {/* Sparkline */}
      {history.length > 0 && (
        <div className="mb-1.5">
          <Sparkline history={history} isPositive={isPositive} height={28} />
        </div>
      )}
      
      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-ast-muted truncate">{name}</span>
        {mentionCount > 0 && (
          <span className="text-[10px] text-ast-muted">{mentionCount}×</span>
        )}
      </div>
    </button>
  );
}

// Company detail modal
function CompanyModal({ 
  companyData,
  stockData,
  items,
  chartRange,
  onRangeChange,
  onClose,
}: { 
  companyData: CompanyData;
  stockData: StockData;
  items: FeedItem[];
  chartRange: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  onClose: () => void;
}) {
  const { quote, history, loading } = stockData;
  const isPositive = (quote?.change ?? 0) >= 0;

  const relatedItems = useMemo(() => {
    const matchTerms = [companyData.name.toLowerCase(), ...companyData.aliases.map((a) => a.toLowerCase())];
    return items
      .filter((item) => {
        const tags = (item.tags as Record<string, string[]>) || {};
        const companies = (tags.company || []).map((c) => c.toLowerCase());
        return companies.some((c) => matchTerms.some((term) => c.includes(term) || term.includes(c)));
      })
      .slice(0, 6);
  }, [companyData, items]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-ast-surface border border-ast-border rounded-lg shadow-2xl w-[400px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-ast-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-ast-text">{companyData.name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-ast-accent text-sm">{companyData.ticker}</span>
              <span className="text-ast-muted text-xs">· {companyData.exchange}</span>
              {quote && (
                <span className={`text-sm font-medium ${isPositive ? "text-ast-mint" : "text-ast-pink"}`}>
                  {isPositive ? "▲" : "▼"} {Math.abs(quote.changePercent).toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded border border-ast-border text-ast-muted hover:text-ast-text flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-ast-muted text-sm animate-pulse">Loading market data...</div>
          ) : (
            <>
              {/* Price */}
              {quote && (
                <div className="mb-4">
                  <div className="text-3xl font-semibold text-ast-text">
                    {formatCurrency(quote.price, quote.currency)}
                  </div>
                </div>
              )}

              {/* Stats row */}
              {quote && (
                <div className={`grid ${quote.marketCap ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mb-4 p-3 bg-ast-bg/50 rounded border border-ast-border/50`}>
                  {quote.marketCap > 0 && (
                    <div className="text-center">
                      <div className="text-sm font-medium text-ast-text">{formatMarketCap(quote.marketCap)}</div>
                      <div className="text-[10px] text-ast-muted">Market Cap</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-sm font-medium text-ast-text">{formatCurrency(quote.fiftyTwoWeekHigh, quote.currency)}</div>
                    <div className="text-[10px] text-ast-muted">52W High</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium text-ast-text">{formatCurrency(quote.fiftyTwoWeekLow, quote.currency)}</div>
                    <div className="text-[10px] text-ast-muted">52W Low</div>
                  </div>
                </div>
              )}

              {/* Chart with range selector */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-ast-muted uppercase">Price History</span>
                  <div className="flex gap-1">
                    {(Object.keys(RANGE_CONFIG) as ChartRange[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => onRangeChange(r)}
                        className={`px-2 py-1 text-[10px] rounded border ${
                          chartRange === r ? "border-ast-accent text-ast-accent" : "border-ast-border text-ast-muted"
                        }`}
                      >
                        {RANGE_CONFIG[r].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-32 bg-ast-bg/50 rounded overflow-hidden">
                  {history.length > 0 ? (
                    <MiniChart history={history} isPositive={isPositive} />
                  ) : (
                    <div className="h-full flex items-center justify-center text-ast-muted text-xs">
                      No chart data
                    </div>
                  )}
                </div>
              </div>

              {/* IR Links */}
              {companyData.irUrl && (
                <div className="flex gap-2 mb-4">
                  <a 
                    href={companyData.irUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-1 px-3 py-2 bg-ast-bg border border-ast-border rounded text-xs text-ast-muted hover:text-ast-accent text-center"
                  >
                    📊 Investor Relations
                  </a>
                  {companyData.secUrl && (
                    <a 
                      href={companyData.secUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex-1 px-3 py-2 bg-ast-bg border border-ast-border rounded text-xs text-ast-muted hover:text-ast-accent text-center"
                    >
                      📄 SEC Filings
                    </a>
                  )}
                </div>
              )}

              {/* Recent coverage */}
              <div>
                <div className="text-xs text-ast-accent uppercase font-semibold mb-2">
                  Recent Coverage ({relatedItems.length})
                </div>
                {relatedItems.length === 0 ? (
                  <p className="text-ast-muted text-xs">No recent coverage found.</p>
                ) : (
                  <div className="space-y-2.5">
                    {relatedItems.map((item) => (
                      <a 
                        key={item.id} 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block group"
                      >
                        <p className="text-xs text-ast-text group-hover:text-ast-accent line-clamp-2 leading-snug">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-ast-muted">{item.sources?.name}</span>
                          <TimeAgo date={item.published_at} className="text-[10px] text-ast-muted" />
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Interactive chart with hover tooltip (Robinhood-style)
function InteractiveChart({ 
  history, 
  isPositive, 
  height = 96 
}: { 
  history: StockHistory[]; 
  isPositive: boolean; 
  height?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (history.length < 2) {
    return <div style={{ height }} className="bg-ast-surface/30 rounded flex items-center justify-center">
      <span className="text-ast-muted text-[10px]">No data</span>
    </div>;
  }

  const prices = history.map((h) => h.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices.map((price, i) => {
    const x = (i / (prices.length - 1)) * 100;
    const y = 100 - ((price - min) / range) * 100;
    return { x, y, price, date: history[i].date };
  });

  const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(" L ")}`;
  const color = isPositive ? "#00d4aa" : "#ff6b8a";

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const index = Math.round(x * (history.length - 1));
    setHoverIndex(Math.max(0, Math.min(history.length - 1, index)));
  };

  const handleMouseLeave = () => setHoverIndex(null);

  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverData = hoverIndex !== null ? history[hoverIndex] : null;

  // Format date nicely
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div 
      ref={containerRef}
      style={{ height }} 
      className="w-full relative cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        
        {/* Hover indicator - minimal vertical line only */}
        {hoverPoint && (
          <line 
            x1={hoverPoint.x} y1="0" 
            x2={hoverPoint.x} y2="100" 
            stroke="#ffffff" 
            strokeWidth="1" 
            vectorEffect="non-scaling-stroke"
            opacity="0.3"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hoverData && hoverPoint && (
        <div 
          className="absolute top-0 pointer-events-none px-2 py-1 bg-ast-surface border border-ast-border rounded shadow-lg text-xs z-10"
          style={{ 
            left: `${hoverPoint.x}%`,
            transform: `translateX(${hoverPoint.x > 70 ? '-100%' : '0'})`,
          }}
        >
          <div className="text-ast-text font-semibold">{hoverData.close.toFixed(2)} pts</div>
          <div className="text-ast-muted text-[10px]">{formatDate(hoverData.date)}</div>
        </div>
      )}
    </div>
  );
}

// Index Modal - detailed view of AS Index (similar to CompanyModal)
function IndexModal({
  indexData,
  weighting,
  onWeightingChange,
  chartRange,
  onRangeChange,
  onClose,
}: {
  indexData: {
    history: StockHistory[];
    change: number;
    totalMarketCap: number;
    stockCount: number;
    weights: { name: string; ticker: string; weight: number; marketCap: number }[];
  };
  weighting: IndexWeighting;
  onWeightingChange: (w: IndexWeighting) => void;
  chartRange: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  onClose: () => void;
}) {
  const isPositive = indexData.change >= 0;
  const currentValue = indexData.history[indexData.history.length - 1]?.close || 100;

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-ast-surface border border-ast-border rounded-lg shadow-2xl w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-ast-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-ast-text">AS Primitives Index</h2>
            <div className="flex items-center gap-2">
              <span className="text-ast-accent text-sm">{indexData.stockCount} stocks</span>
              <span className={`text-sm font-medium ${isPositive ? "text-ast-mint" : "text-ast-pink"}`}>
                {isPositive ? "▲" : "▼"} {Math.abs(indexData.change).toFixed(2)}%
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded border border-ast-border text-ast-muted hover:text-ast-text flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Index value */}
          <div className="text-3xl font-semibold text-ast-text mb-4">
            {currentValue.toFixed(2)}
            <span className="text-sm text-ast-muted ml-1">pts</span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-ast-bg/50 rounded border border-ast-border/50">
            <div className="text-center">
              <div className="text-sm font-medium text-ast-text">{formatMarketCap(indexData.totalMarketCap)}</div>
              <div className="text-[10px] text-ast-muted">Combined Mkt Cap</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-ast-text">{indexData.stockCount}</div>
              <div className="text-[10px] text-ast-muted">Constituents</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-ast-text capitalize">{weighting}</div>
              <div className="text-[10px] text-ast-muted">Weighting</div>
            </div>
          </div>

          {/* Chart with range selector */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex gap-1">
                <button
                  onClick={() => onWeightingChange("equal")}
                  className={`px-2 py-1 text-[10px] rounded border ${
                    weighting === "equal" ? "border-ast-accent text-ast-accent" : "border-ast-border text-ast-muted"
                  }`}
                >
                  Equal
                </button>
                <button
                  onClick={() => onWeightingChange("mcap")}
                  className={`px-2 py-1 text-[10px] rounded border ${
                    weighting === "mcap" ? "border-ast-accent text-ast-accent" : "border-ast-border text-ast-muted"
                  }`}
                >
                  Mkt Cap
                </button>
              </div>
              <div className="flex gap-1">
                {(Object.keys(RANGE_CONFIG) as ChartRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => onRangeChange(r)}
                    className={`px-2 py-1 text-[10px] rounded border ${
                      chartRange === r ? "border-ast-accent text-ast-accent" : "border-ast-border text-ast-muted"
                    }`}
                  >
                    {RANGE_CONFIG[r].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-52 bg-ast-bg/50 rounded overflow-hidden">
              {indexData.history.length > 1 ? (
                <InteractiveChart history={indexData.history} isPositive={isPositive} height={208} />
              ) : (
                <div className="h-full flex items-center justify-center text-ast-muted text-xs">
                  No chart data
                </div>
              )}
            </div>
          </div>

          {/* Weights breakdown */}
          <div>
            <div className="text-xs text-ast-accent uppercase font-semibold mb-2">
              Constituent Weights
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {indexData.weights.map((w) => (
                <div key={w.ticker} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-ast-accent font-medium w-16">{w.ticker}</span>
                    <span className="text-ast-muted">{w.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {weighting === "mcap" && (
                      <span className="text-ast-muted text-[10px]">{formatMarketCap(w.marketCap)}</span>
                    )}
                    <span className="text-ast-text font-medium w-12 text-right">
                      {(w.weight * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Index Overview component - aggregated chart for AS Index
function IndexOverview({
  stockDataMap,
  basketCompanies,
  weighting,
  onWeightingChange,
  chartRange,
  onRangeChange,
  onOpenModal,
}: {
  stockDataMap: Record<string, StockData>;
  basketCompanies: { name: string; data: CompanyData | null; mentions: number }[];
  weighting: IndexWeighting;
  onWeightingChange: (w: IndexWeighting) => void;
  chartRange: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  onOpenModal: () => void;
}) {
  // Calculate composite index
  const indexData = useMemo(() => {
    // Get all stocks with valid data
    const validStocks = basketCompanies
      .filter((c) => c.data?.ticker)
      .map((c) => ({
        ticker: c.data!.ticker,
        name: c.name,
        data: stockDataMap[c.data!.ticker],
      }))
      .filter((s) => s.data?.history?.length > 1 && s.data?.quote);

    if (validStocks.length === 0) {
      return { history: [], change: 0, totalMarketCap: 0, stockCount: 0 };
    }

    // Build price maps with forward-fill for missing dates
    const priceMaps: Record<string, Record<string, number>> = {};
    const firstPrices: Record<string, number> = {};
    const marketCaps: Record<string, number> = {};
    const allDatesSet = new Set<string>();
    
    for (const stock of validStocks) {
      priceMaps[stock.ticker] = {};
      marketCaps[stock.ticker] = stock.data.quote?.marketCap || 1; // Default to 1 to avoid div by zero
      
      for (const h of stock.data.history) {
        priceMaps[stock.ticker][h.date] = h.close;
        allDatesSet.add(h.date);
        if (!firstPrices[stock.ticker]) {
          firstPrices[stock.ticker] = h.close;
        }
      }
    }

    const sortedDates = Array.from(allDatesSet).sort();

    // Forward-fill missing prices for each stock
    for (const stock of validStocks) {
      let lastPrice = firstPrices[stock.ticker];
      for (const date of sortedDates) {
        if (priceMaps[stock.ticker][date]) {
          lastPrice = priceMaps[stock.ticker][date];
        } else {
          priceMaps[stock.ticker][date] = lastPrice;
        }
      }
    }

    // Calculate weights (fixed for entire period)
    const totalMcap = Object.values(marketCaps).reduce((a, b) => a + b, 0);
    const weights: Record<string, number> = {};
    for (const stock of validStocks) {
      weights[stock.ticker] = weighting === "mcap" 
        ? marketCaps[stock.ticker] / totalMcap 
        : 1 / validStocks.length;
    }

    // Calculate index value for each date
    const indexHistory: StockHistory[] = [];

    for (const date of sortedDates) {
      let indexValue = 0;

      for (const stock of validStocks) {
        const price = priceMaps[stock.ticker][date];
        const firstPrice = firstPrices[stock.ticker];
        
        // Normalize to 100 at start, then weight
        const normalizedValue = (price / firstPrice) * 100;
        indexValue += normalizedValue * weights[stock.ticker];
      }
      
      indexHistory.push({ date, close: indexValue });
    }

    // Calculate total change
    const firstValue = indexHistory[0]?.close || 100;
    const lastValue = indexHistory[indexHistory.length - 1]?.close || 100;
    const change = ((lastValue - firstValue) / firstValue) * 100;

    // Build weights info for display
    const weightInfo = validStocks.map((s) => ({
      name: s.name,
      ticker: s.ticker,
      weight: weights[s.ticker],
      marketCap: marketCaps[s.ticker],
    })).sort((a, b) => b.weight - a.weight);

    return {
      history: indexHistory,
      change,
      totalMarketCap: totalMcap,
      stockCount: validStocks.length,
      weights: weightInfo,
    };
  }, [stockDataMap, basketCompanies, weighting]);

  const isPositive = indexData.change >= 0;
  const loading = basketCompanies.some((c) => c.data?.ticker && stockDataMap[c.data.ticker]?.loading);

  return (
    <div className="p-3 border-b border-ast-border bg-ast-surface/30">
      {/* Clickable area to open modal */}
      <button 
        onClick={onOpenModal}
        className="w-full text-left hover:bg-ast-surface/50 -m-2 p-2 rounded transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ast-text">AS Primitives Index</span>
            <span className="text-[10px] text-ast-muted">
              {indexData.stockCount} stocks
            </span>
          </div>
          {loading ? (
            <span className="text-xs text-ast-muted animate-pulse">Loading...</span>
          ) : (
            <span className={`text-sm font-semibold ${isPositive ? "text-ast-mint" : "text-ast-pink"}`}>
              {isPositive ? "▲" : "▼"} {Math.abs(indexData.change).toFixed(2)}%
            </span>
          )}
        </div>

        {/* Index value */}
        {indexData.history.length > 0 && (
          <div className="text-2xl font-semibold text-ast-text mb-2">
            {indexData.history[indexData.history.length - 1]?.close.toFixed(2)}
            <span className="text-xs text-ast-muted ml-1">pts</span>
          </div>
        )}

        {/* Interactive Chart */}
        {indexData.history.length > 1 && (
          <div className="h-24 mb-3">
            <InteractiveChart history={indexData.history} isPositive={isPositive} height={96} />
          </div>
        )}
      </button>

      {/* Controls */}
      <div className="flex items-center justify-between">
        {/* Weighting toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => onWeightingChange("equal")}
            className={`px-2 py-1 text-[10px] rounded border transition-colors ${
              weighting === "equal"
                ? "border-ast-accent text-ast-accent bg-ast-accent/10"
                : "border-ast-border text-ast-muted hover:text-ast-text"
            }`}
          >
            Equal
          </button>
          <button
            onClick={() => onWeightingChange("mcap")}
            className={`px-2 py-1 text-[10px] rounded border transition-colors ${
              weighting === "mcap"
                ? "border-ast-accent text-ast-accent bg-ast-accent/10"
                : "border-ast-border text-ast-muted hover:text-ast-text"
            }`}
          >
            Mkt Cap
          </button>
        </div>

        {/* Range selector */}
        <div className="flex gap-1">
          {(Object.keys(RANGE_CONFIG) as ChartRange[]).map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                chartRange === r
                  ? "border-ast-accent text-ast-accent bg-ast-accent/10"
                  : "border-ast-border text-ast-muted hover:text-ast-text"
              }`}
            >
              {RANGE_CONFIG[r].label}
            </button>
          ))}
        </div>
      </div>

      {/* Market cap info */}
      {weighting === "mcap" && indexData.totalMarketCap > 0 && (
        <div className="mt-2 text-[10px] text-ast-muted">
          Combined market cap: {formatMarketCap(indexData.totalMarketCap)}
        </div>
      )}
    </div>
  );
}

export function CompanyTray({ items, selectedCompany, onSelectCompany }: CompanyTrayProps) {
  const [activeBasket, setActiveBasket] = useState<string>("AS Index");
  const [stockDataMap, setStockDataMap] = useState<Record<string, StockData>>({});
  const [chartRange, setChartRange] = useState<ChartRange>("1mo");
  const [indexWeighting, setIndexWeighting] = useState<IndexWeighting>("equal");
  const [showIndexModal, setShowIndexModal] = useState(false);
  
  const basketNames = Object.keys(COMPANY_BASKETS);
  const currentBasket = COMPANY_BASKETS[activeBasket] || [];

  // Compute mention counts from feed
  const mentionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const tags = (item.tags as Record<string, string[]>) || {};
      const companies = tags.company || [];
      for (const c of companies) {
        counts[c] = (counts[c] || 0) + 1;
      }
    }
    return counts;
  }, [items]);

  // Get company data for current basket
  const basketCompanies = useMemo(() => {
    return currentBasket.map((name) => ({
      name,
      data: findCompanyByName(name),
      mentions: mentionCounts[name] || 0,
    }));
  }, [currentBasket, mentionCounts]);

  // Track last fetched range to detect changes
  const [lastFetchedRange, setLastFetchedRange] = useState<ChartRange | null>(null);

  // Fetch stock data for basket companies
  useEffect(() => {
    const rangeChanged = lastFetchedRange !== chartRange;
    const tickersToFetch = basketCompanies
      .filter((c) => c.data?.ticker && (rangeChanged || !stockDataMap[c.data.ticker]))
      .map((c) => c.data!.ticker);

    if (tickersToFetch.length === 0) return;

    // Mark as loading
    const loadingUpdates: Record<string, StockData> = {};
    for (const ticker of tickersToFetch) {
      loadingUpdates[ticker] = { quote: stockDataMap[ticker]?.quote || null, history: [], loading: true };
    }
    setStockDataMap((prev) => ({ ...prev, ...loadingUpdates }));
    setLastFetchedRange(chartRange);

    // Fetch all
    const config = RANGE_CONFIG[chartRange];
    Promise.all(
      tickersToFetch.map(async (ticker) => {
        try {
          const res = await fetch(`/api/stock/${ticker}?range=${config.range}&interval=${config.interval}`);
          const data = await res.json();
          return { ticker, quote: data.quote || null, history: data.history || [] };
        } catch {
          return { ticker, quote: null, history: [] };
        }
      })
    ).then((results) => {
      const updates: Record<string, StockData> = {};
      for (const r of results) {
        updates[r.ticker] = { quote: r.quote, history: r.history, loading: false };
      }
      setStockDataMap((prev) => ({ ...prev, ...updates }));
    });
  }, [basketCompanies, chartRange]);

  // Refetch when chart range changes for expanded company
  useEffect(() => {
    if (!selectedCompany) return;
    const companyData = findCompanyByName(selectedCompany);
    if (!companyData?.ticker) return;

    const config = RANGE_CONFIG[chartRange];
    fetch(`/api/stock/${companyData.ticker}?range=${config.range}&interval=${config.interval}`)
      .then((res) => res.json())
      .then((data) => {
        setStockDataMap((prev) => ({
          ...prev,
          [companyData.ticker]: { quote: data.quote || null, history: data.history || [], loading: false },
        }));
      })
      .catch(() => {});
  }, [selectedCompany, chartRange]);

  const getStockData = (ticker: string | undefined): StockData => {
    if (!ticker) return { quote: null, history: [], loading: false };
    return stockDataMap[ticker] || { quote: null, history: [], loading: true };
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const selectedCompanyData = selectedCompany ? findCompanyByName(selectedCompany) : null;

  const modal = selectedCompany && selectedCompanyData && mounted ? (
    <CompanyModal
      companyData={selectedCompanyData}
      stockData={getStockData(selectedCompanyData.ticker)}
      items={items}
      chartRange={chartRange}
      onRangeChange={setChartRange}
      onClose={() => onSelectCompany(null)}
    />
  ) : null;

  // Calculate index data for modal (same logic as IndexOverview)
  const indexDataForModal = useMemo(() => {
    if (activeBasket !== "AS Index") return null;
    
    const validStocks = basketCompanies
      .filter((c) => c.data?.ticker)
      .map((c) => ({
        ticker: c.data!.ticker,
        name: c.name,
        data: stockDataMap[c.data!.ticker],
      }))
      .filter((s) => s.data?.history?.length > 1 && s.data?.quote);

    if (validStocks.length === 0) return null;

    const priceMaps: Record<string, Record<string, number>> = {};
    const firstPrices: Record<string, number> = {};
    const marketCaps: Record<string, number> = {};
    const allDatesSet = new Set<string>();
    
    for (const stock of validStocks) {
      priceMaps[stock.ticker] = {};
      marketCaps[stock.ticker] = stock.data.quote?.marketCap || 1;
      
      for (const h of stock.data.history) {
        priceMaps[stock.ticker][h.date] = h.close;
        allDatesSet.add(h.date);
        if (!firstPrices[stock.ticker]) {
          firstPrices[stock.ticker] = h.close;
        }
      }
    }

    const sortedDates = Array.from(allDatesSet).sort();

    for (const stock of validStocks) {
      let lastPrice = firstPrices[stock.ticker];
      for (const date of sortedDates) {
        if (priceMaps[stock.ticker][date]) {
          lastPrice = priceMaps[stock.ticker][date];
        } else {
          priceMaps[stock.ticker][date] = lastPrice;
        }
      }
    }

    const totalMcap = Object.values(marketCaps).reduce((a, b) => a + b, 0);
    const weights: Record<string, number> = {};
    for (const stock of validStocks) {
      weights[stock.ticker] = indexWeighting === "mcap" 
        ? marketCaps[stock.ticker] / totalMcap 
        : 1 / validStocks.length;
    }

    const indexHistory: StockHistory[] = [];
    for (const date of sortedDates) {
      let indexValue = 0;
      for (const stock of validStocks) {
        const price = priceMaps[stock.ticker][date];
        const firstPrice = firstPrices[stock.ticker];
        const normalizedValue = (price / firstPrice) * 100;
        indexValue += normalizedValue * weights[stock.ticker];
      }
      indexHistory.push({ date, close: indexValue });
    }

    const firstValue = indexHistory[0]?.close || 100;
    const lastValue = indexHistory[indexHistory.length - 1]?.close || 100;
    const change = ((lastValue - firstValue) / firstValue) * 100;

    const weightInfo = validStocks.map((s) => ({
      name: s.name,
      ticker: s.ticker,
      weight: weights[s.ticker],
      marketCap: marketCaps[s.ticker],
    })).sort((a, b) => b.weight - a.weight);

    return {
      history: indexHistory,
      change,
      totalMarketCap: totalMcap,
      stockCount: validStocks.length,
      weights: weightInfo,
    };
  }, [activeBasket, basketCompanies, stockDataMap, indexWeighting]);

  return (
    <div className="h-full flex flex-col bg-ast-bg">
      {/* Header with basket tabs */}
      <div className="px-3 py-2 border-b border-ast-border bg-ast-bg/95 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-ast-mint text-xs font-semibold tracking-wide">📈 PUBLIC MARKETS</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {basketNames.map((name) => (
            <button
              key={name}
              onClick={() => {
                setActiveBasket(name);
                onSelectCompany(null);
              }}
              className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                activeBasket === name
                  ? "border-ast-accent text-ast-accent bg-ast-accent/10"
                  : "border-ast-border text-ast-muted hover:text-ast-text"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Index Overview - only for AS Index */}
      {activeBasket === "AS Index" && (
        <IndexOverview
          stockDataMap={stockDataMap}
          basketCompanies={basketCompanies}
          weighting={indexWeighting}
          onWeightingChange={setIndexWeighting}
          chartRange={chartRange}
          onRangeChange={setChartRange}
          onOpenModal={() => setShowIndexModal(true)}
        />
      )}

      {/* Company grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {basketCompanies.map(({ name, data, mentions }) => (
            <CompanyCard
              key={name}
              name={name}
              companyData={data}
              stockData={getStockData(data?.ticker)}
              mentionCount={mentions}
              isExpanded={selectedCompany === name}
              onClick={() => onSelectCompany(name)}
            />
          ))}
        </div>
      </div>

      {/* Modal portal */}
      {mounted && modal && createPortal(modal, document.body)}
      
      {/* Index Modal portal */}
      {mounted && showIndexModal && indexDataForModal && createPortal(
        <IndexModal
          indexData={indexDataForModal}
          weighting={indexWeighting}
          onWeightingChange={setIndexWeighting}
          chartRange={chartRange}
          onRangeChange={setChartRange}
          onClose={() => setShowIndexModal(false)}
        />,
        document.body
      )}
    </div>
  );
}
