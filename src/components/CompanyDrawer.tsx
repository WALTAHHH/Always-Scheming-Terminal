"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { findCompanyByName, isPublicCompany, type CompanyData } from "@/lib/companies";
import type { StockResponse, StockQuote, StockHistory } from "@/app/api/stock/[ticker]/route";
import type { FeedItem } from "@/lib/database.types";

// Global state for the drawer (avoids context issues with SSR)
let globalOpenCompany: ((name: string) => void) | null = null;
let globalItems: FeedItem[] = [];

export function setGlobalItems(items: FeedItem[]) {
  globalItems = items;
}

export function openCompanyDrawer(name: string) {
  if (globalOpenCompany) {
    globalOpenCompany(name);
  }
}

type ChartRange = "1w" | "1mo" | "6mo" | "1y";

const RANGE_CONFIG: Record<ChartRange, { range: string; interval: string; label: string }> = {
  "1w": { range: "5d", interval: "1h", label: "1W" },
  "1mo": { range: "1mo", interval: "1d", label: "1M" },
  "6mo": { range: "6mo", interval: "1d", label: "6M" },
  "1y": { range: "1y", interval: "1wk", label: "1Y" },
};

function formatCurrency(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}

function MiniChart({ history, isPositive }: { history: StockHistory[]; isPositive: boolean }) {
  if (history.length < 2) {
    return (
      <div className="h-24 bg-ast-surface/50 rounded flex items-center justify-center">
        <span className="text-ast-muted text-xs">No chart data</span>
      </div>
    );
  }

  const prices = history.map((h) => h.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices.map((price, i) => {
    const x = 5 + (i / (prices.length - 1)) * 90;
    const y = 5 + 90 - ((price - min) / range) * 90;
    return `${x},${y}`;
  });

  const color = isPositive ? "#00d4aa" : "#ff6b8a";

  return (
    <div className="h-24 bg-ast-surface/50 rounded overflow-hidden">
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

interface DrawerContentProps {
  companyName: string;
  companyData: CompanyData | null;
  onClose: () => void;
}

function DrawerContent({ companyName, companyData, onClose }: DrawerContentProps) {
  const [stockData, setStockData] = useState<StockResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>("1mo");

  const relatedItems = useMemo(() => {
    if (!companyData) return [];
    const matchTerms = [companyData.name.toLowerCase(), ...companyData.aliases.map((a) => a.toLowerCase())];
    return globalItems
      .filter((item) => {
        const tags = (item.tags as Record<string, string[]>) || {};
        const companies = (tags.company || []).map((c) => c.toLowerCase());
        return companies.some((c) => matchTerms.some((term) => c.includes(term) || term.includes(c)));
      })
      .slice(0, 8);
  }, [companyData]);

  useEffect(() => {
    if (!companyData || !companyData.ticker) return;

    const fetchStock = async () => {
      setLoading(true);
      try {
        const config = RANGE_CONFIG[chartRange];
        const res = await fetch(`/api/stock/${companyData.ticker}?range=${config.range}&interval=${config.interval}`);
        const data = await res.json();
        setStockData(data);
      } catch {
        setStockData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStock();
  }, [companyData, chartRange]);

  const quote = stockData?.quote;
  const history = stockData?.history || [];
  const isPositive = (quote?.change ?? 0) >= 0;

  return (
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-ast-bg border-l border-ast-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-ast-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ast-text">{companyData?.name || companyName}</h2>
            {companyData?.ticker && (
              <span className="text-ast-accent text-sm">{companyData.ticker} · {companyData.exchange}</span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded border border-ast-border text-ast-muted hover:text-ast-text flex items-center justify-center">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!companyData || !companyData.ticker ? (
            <div className="p-5 text-ast-muted text-sm">No market data available for "{companyName}"</div>
          ) : loading && !stockData ? (
            <div className="p-5 text-ast-muted text-sm animate-pulse">Loading market data...</div>
          ) : (
            <>
              {quote && quote.price != null && (
                <div className="px-5 py-4 border-b border-ast-border">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-semibold text-ast-text">{formatCurrency(quote.price, quote.currency)}</span>
                    <span className={isPositive ? "text-ast-mint" : "text-ast-pink"}>
                      {isPositive ? "▲" : "▼"} {formatCurrency(Math.abs(quote.change ?? 0), quote.currency)} ({(quote.changePercent ?? 0).toFixed(2)}%)
                    </span>
                  </div>
                </div>
              )}

              {quote && quote.price != null && (
                <div className="grid grid-cols-3 gap-4 px-5 py-3 border-b border-ast-border bg-ast-surface/30">
                  <div className="text-center">
                    <div className="text-sm font-medium text-ast-text">{formatMarketCap(quote.marketCap ?? 0)}</div>
                    <div className="text-[10px] text-ast-muted">Market Cap</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium text-ast-text">{formatCurrency(quote.fiftyTwoWeekHigh ?? 0, quote.currency)}</div>
                    <div className="text-[10px] text-ast-muted">52W High</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium text-ast-text">{formatCurrency(quote.fiftyTwoWeekLow ?? 0, quote.currency)}</div>
                    <div className="text-[10px] text-ast-muted">52W Low</div>
                  </div>
                </div>
              )}

              <div className="px-5 py-4 border-b border-ast-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-ast-muted uppercase">Price History</span>
                  <div className="flex gap-1">
                    {(Object.keys(RANGE_CONFIG) as ChartRange[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setChartRange(r)}
                        className={`px-2 py-0.5 text-[10px] rounded border ${chartRange === r ? "border-ast-accent text-ast-accent" : "border-ast-border text-ast-muted"}`}
                      >
                        {RANGE_CONFIG[r].label}
                      </button>
                    ))}
                  </div>
                </div>
                <MiniChart history={history} isPositive={isPositive} />
              </div>

              {companyData.irUrl && (
                <div className="px-5 py-3 border-b border-ast-border flex gap-2">
                  <a href={companyData.irUrl} target="_blank" rel="noopener noreferrer" className="flex-1 px-3 py-2 bg-ast-surface border border-ast-border rounded text-xs text-ast-muted hover:text-ast-accent text-center">
                    📊 Investor Relations
                  </a>
                  {companyData.secUrl && (
                    <a href={companyData.secUrl} target="_blank" rel="noopener noreferrer" className="flex-1 px-3 py-2 bg-ast-surface border border-ast-border rounded text-xs text-ast-muted hover:text-ast-accent text-center">
                      📄 SEC Filings
                    </a>
                  )}
                </div>
              )}

              <div className="px-5 py-4">
                <div className="text-xs text-ast-accent uppercase font-semibold mb-3">Recent Coverage ({relatedItems.length})</div>
                {relatedItems.length === 0 ? (
                  <p className="text-ast-muted text-xs">No recent coverage found.</p>
                ) : (
                  <div className="space-y-3">
                    {relatedItems.map((item) => (
                      <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="block group">
                        <p className="text-xs text-ast-text group-hover:text-ast-accent line-clamp-2">{item.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-ast-muted">{item.sources?.name}</span>
                          <span className="text-[10px] text-ast-muted">{getHoursAgo(item.published_at)}</span>
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

export function CompanyDrawerPortal() {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    globalOpenCompany = setSelectedCompany;
    return () => {
      globalOpenCompany = null;
    };
  }, []);

  const companyData = useMemo(() => {
    if (!selectedCompany) return null;
    return findCompanyByName(selectedCompany);
  }, [selectedCompany]);

  if (!mounted || !selectedCompany) return null;

  return createPortal(
    <DrawerContent
      companyName={selectedCompany}
      companyData={companyData}
      onClose={() => setSelectedCompany(null)}
    />,
    document.body
  );
}
