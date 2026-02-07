"use client";

import { useState, useEffect, useMemo } from "react";
import { findCompanyByName, type CompanyData } from "@/lib/companies";
import type { FeedItem } from "@/lib/database.types";

interface CompanyTrayProps {
  items: FeedItem[];
  selectedCompany: string | null;
  onSelectCompany: (name: string | null) => void;
}

type ChartRange = "1w" | "1mo" | "6mo" | "1y";

const RANGE_CONFIG: Record<ChartRange, { range: string; interval: string; label: string }> = {
  "1w": { range: "5d", interval: "1h", label: "1W" },
  "1mo": { range: "1mo", interval: "1d", label: "1M" },
  "6mo": { range: "6mo", interval: "1d", label: "6M" },
  "1y": { range: "1y", interval: "1wk", label: "1Y" },
};

// Curated baskets
const COMPANY_BASKETS: Record<string, string[]> = {
  "AS Index": [
    "Microsoft", "Sony Interactive", "Nintendo", "Roblox", "Unity", "AppLovin",
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

function getHoursAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const hours = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

// Expanded company detail
function CompanyDetail({ 
  companyData,
  stockData,
  items,
  chartRange,
  onRangeChange,
}: { 
  companyData: CompanyData;
  stockData: StockData;
  items: FeedItem[];
  chartRange: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}) {
  const { quote, history } = stockData;
  const isPositive = (quote?.change ?? 0) >= 0;

  const relatedItems = useMemo(() => {
    const matchTerms = [companyData.name.toLowerCase(), ...companyData.aliases.map((a) => a.toLowerCase())];
    return items
      .filter((item) => {
        const tags = (item.tags as Record<string, string[]>) || {};
        const companies = (tags.company || []).map((c) => c.toLowerCase());
        return companies.some((c) => matchTerms.some((term) => c.includes(term) || term.includes(c)));
      })
      .slice(0, 4);
  }, [companyData, items]);

  return (
    <div className="mt-2 p-3 bg-ast-surface/30 rounded border border-ast-border/50">
      {/* Stats row */}
      {quote && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <div className="text-xs font-medium text-ast-text">{formatMarketCap(quote.marketCap)}</div>
            <div className="text-[9px] text-ast-muted">Mkt Cap</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-medium text-ast-text">{formatCurrency(quote.fiftyTwoWeekHigh, quote.currency)}</div>
            <div className="text-[9px] text-ast-muted">52W Hi</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-medium text-ast-text">{formatCurrency(quote.fiftyTwoWeekLow, quote.currency)}</div>
            <div className="text-[9px] text-ast-muted">52W Lo</div>
          </div>
        </div>
      )}

      {/* Chart with range selector */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] text-ast-muted uppercase">Price History</span>
          <div className="flex gap-0.5">
            {(Object.keys(RANGE_CONFIG) as ChartRange[]).map((r) => (
              <button
                key={r}
                onClick={(e) => { e.stopPropagation(); onRangeChange(r); }}
                className={`px-1.5 py-0.5 text-[9px] rounded border ${
                  chartRange === r ? "border-ast-accent text-ast-accent" : "border-ast-border text-ast-muted"
                }`}
              >
                {RANGE_CONFIG[r].label}
              </button>
            ))}
          </div>
        </div>
        <MiniChart history={history} isPositive={isPositive} />
      </div>

      {/* IR Links */}
      {companyData.irUrl && (
        <div className="flex gap-2 mb-3">
          <a 
            href={companyData.irUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            onClick={(e) => e.stopPropagation()}
            className="flex-1 px-2 py-1.5 bg-ast-bg border border-ast-border rounded text-[10px] text-ast-muted hover:text-ast-accent text-center"
          >
            📊 IR
          </a>
          {companyData.secUrl && (
            <a 
              href={companyData.secUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()} 
              className="flex-1 px-2 py-1.5 bg-ast-bg border border-ast-border rounded text-[10px] text-ast-muted hover:text-ast-accent text-center"
            >
              📄 SEC
            </a>
          )}
        </div>
      )}

      {/* Recent coverage */}
      {relatedItems.length > 0 && (
        <div>
          <div className="text-[9px] text-ast-muted uppercase mb-1.5">Recent Coverage</div>
          <div className="space-y-1.5">
            {relatedItems.map((item) => (
              <a 
                key={item.id} 
                href={item.url} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="block group"
              >
                <p className="text-[11px] text-ast-text group-hover:text-ast-accent line-clamp-1 leading-tight">
                  {item.title}
                </p>
                <span className="text-[9px] text-ast-muted">{item.sources?.name} · {getHoursAgo(item.published_at)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CompanyTray({ items, selectedCompany, onSelectCompany }: CompanyTrayProps) {
  const [activeBasket, setActiveBasket] = useState<string>("AS Index");
  const [stockDataMap, setStockDataMap] = useState<Record<string, StockData>>({});
  const [chartRange, setChartRange] = useState<ChartRange>("1mo");
  
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

  // Fetch stock data for basket companies
  useEffect(() => {
    const tickersToFetch = basketCompanies
      .filter((c) => c.data?.ticker && !stockDataMap[c.data.ticker])
      .map((c) => c.data!.ticker);

    if (tickersToFetch.length === 0) return;

    // Mark as loading
    const loadingUpdates: Record<string, StockData> = {};
    for (const ticker of tickersToFetch) {
      loadingUpdates[ticker] = { quote: null, history: [], loading: true };
    }
    setStockDataMap((prev) => ({ ...prev, ...loadingUpdates }));

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

      {/* Company grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {basketCompanies.map(({ name, data, mentions }) => (
            <div key={name}>
              <CompanyCard
                name={name}
                companyData={data}
                stockData={getStockData(data?.ticker)}
                mentionCount={mentions}
                isExpanded={selectedCompany === name}
                onClick={() => onSelectCompany(selectedCompany === name ? null : name)}
              />
              {selectedCompany === name && data && (
                <CompanyDetail
                  companyData={data}
                  stockData={getStockData(data.ticker)}
                  items={items}
                  chartRange={chartRange}
                  onRangeChange={setChartRange}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
