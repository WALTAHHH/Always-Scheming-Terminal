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

// Placeholder baskets - will be curated later
const COMPANY_BASKETS: Record<string, string[]> = {
  "AS Index": [
    // Always Scheming's curated picks - TBD
    "Microsoft", "Sony Interactive", "Nintendo", "Roblox", "Unity Technologies", "AppLovin",
  ],
  "Western Pure-Play": [
    // Western-focused public gaming companies
    "Electronic Arts", "Take-Two Interactive", "Ubisoft", "CD Projekt", "Embracer Group", "Paradox Interactive",
  ],
  "Asian Giants": [
    // Major Asian publishers
    "Tencent", "NetEase", "Nexon", "Krafton", "Bandai Namco", "Capcom",
  ],
  "Platform Holders": [
    // Console/platform owners
    "Microsoft", "Sony Interactive", "Nintendo", "Valve", "Epic Games", "Apple",
  ],
  "Mobile Leaders": [
    // Mobile-first publishers
    "AppLovin", "Playtika", "Scopely", "Moon Active", "Dream Games", "Supercell",
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
      <div className="h-16 bg-ast-surface/50 rounded flex items-center justify-center">
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
    <div className="h-16 bg-ast-surface/50 rounded overflow-hidden">
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

// Company card in the basket grid
function BasketCompanyCard({ 
  name, 
  isSelected,
  onClick 
}: { 
  name: string; 
  isSelected: boolean;
  onClick: () => void;
}) {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const companyData = useMemo(() => findCompanyByName(name), [name]);
  
  useEffect(() => {
    if (!companyData?.ticker) return;
    
    setLoading(true);
    fetch(`/api/stock/${companyData.ticker}?range=1d&interval=1d`)
      .then(res => res.json())
      .then(data => {
        if (data.quote) setQuote(data.quote);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyData?.ticker]);

  const isPositive = (quote?.change ?? 0) >= 0;

  return (
    <button
      onClick={onClick}
      className={`p-2 rounded border text-left transition-colors ${
        isSelected 
          ? "border-ast-accent bg-ast-accent/10" 
          : "border-ast-border hover:border-ast-muted bg-ast-surface/50"
      }`}
    >
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <span className="text-[10px] font-medium text-ast-accent truncate">
          {companyData?.ticker || name.slice(0, 6).toUpperCase()}
        </span>
        {loading ? (
          <span className="text-[9px] text-ast-muted animate-pulse">...</span>
        ) : quote ? (
          <span className={`text-[10px] font-medium ${isPositive ? "text-ast-mint" : "text-ast-pink"}`}>
            {isPositive ? "▲" : "▼"}{Math.abs(quote.changePercent).toFixed(1)}%
          </span>
        ) : null}
      </div>
      <div className="text-[9px] text-ast-muted truncate">{name}</div>
    </button>
  );
}

// Detailed company view
function CompanyDetail({ 
  companyName, 
  companyData,
  items 
}: { 
  companyName: string;
  companyData: CompanyData | null;
  items: FeedItem[];
}) {
  const [stockData, setStockData] = useState<{ quote: StockQuote | null; history: StockHistory[] }>({ quote: null, history: [] });
  const [loading, setLoading] = useState(false);
  const [chartRange, setChartRange] = useState<ChartRange>("1mo");

  const relatedItems = useMemo(() => {
    if (!companyData) return [];
    const matchTerms = [companyData.name.toLowerCase(), ...companyData.aliases.map((a) => a.toLowerCase())];
    return items
      .filter((item) => {
        const tags = (item.tags as Record<string, string[]>) || {};
        const companies = (tags.company || []).map((c) => c.toLowerCase());
        return companies.some((c) => matchTerms.some((term) => c.includes(term) || term.includes(c)));
      })
      .slice(0, 5);
  }, [companyData, items]);

  useEffect(() => {
    if (!companyData?.ticker) return;

    setLoading(true);
    const config = RANGE_CONFIG[chartRange];
    fetch(`/api/stock/${companyData.ticker}?range=${config.range}&interval=${config.interval}`)
      .then(res => res.json())
      .then(data => {
        setStockData({ quote: data.quote || null, history: data.history || [] });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyData?.ticker, chartRange]);

  const { quote, history } = stockData;
  const isPositive = (quote?.change ?? 0) >= 0;

  if (!companyData) {
    return (
      <div className="p-3 text-ast-muted text-xs">
        No data available for "{companyName}"
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-ast-border flex items-center justify-between flex-shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ast-text truncate">{companyData.name}</h3>
          {companyData.ticker && (
            <span className="text-ast-accent text-[10px]">{companyData.ticker} · {companyData.exchange}</span>
          )}
        </div>
        {quote && (
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-medium text-ast-text">{formatCurrency(quote.price, quote.currency)}</div>
            <div className={`text-[10px] ${isPositive ? "text-ast-mint" : "text-ast-pink"}`}>
              {isPositive ? "▲" : "▼"} {Math.abs(quote.changePercent).toFixed(2)}%
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && !quote ? (
          <div className="p-3 text-ast-muted text-xs animate-pulse">Loading...</div>
        ) : (
          <>
            {/* Quick stats */}
            {quote && (
              <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-ast-border bg-ast-surface/30">
                <div className="text-center">
                  <div className="text-[11px] font-medium text-ast-text">{formatMarketCap(quote.marketCap)}</div>
                  <div className="text-[9px] text-ast-muted">Mkt Cap</div>
                </div>
                <div className="text-center">
                  <div className="text-[11px] font-medium text-ast-text">{formatCurrency(quote.fiftyTwoWeekHigh, quote.currency)}</div>
                  <div className="text-[9px] text-ast-muted">52W Hi</div>
                </div>
                <div className="text-center">
                  <div className="text-[11px] font-medium text-ast-text">{formatCurrency(quote.fiftyTwoWeekLow, quote.currency)}</div>
                  <div className="text-[9px] text-ast-muted">52W Lo</div>
                </div>
              </div>
            )}

            {/* Chart */}
            <div className="px-3 py-2 border-b border-ast-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-ast-muted uppercase">Price</span>
                <div className="flex gap-0.5">
                  {(Object.keys(RANGE_CONFIG) as ChartRange[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setChartRange(r)}
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
              <div className="px-3 py-2 border-b border-ast-border flex gap-2">
                <a 
                  href={companyData.irUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-1 px-2 py-1.5 bg-ast-surface border border-ast-border rounded text-[10px] text-ast-muted hover:text-ast-accent text-center"
                >
                  📊 IR
                </a>
                {companyData.secUrl && (
                  <a 
                    href={companyData.secUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex-1 px-2 py-1.5 bg-ast-surface border border-ast-border rounded text-[10px] text-ast-muted hover:text-ast-accent text-center"
                  >
                    📄 SEC
                  </a>
                )}
              </div>
            )}

            {/* Recent coverage */}
            <div className="px-3 py-2">
              <div className="text-[10px] text-ast-accent uppercase font-semibold mb-2">
                Recent Coverage ({relatedItems.length})
              </div>
              {relatedItems.length === 0 ? (
                <p className="text-ast-muted text-[10px]">No recent coverage</p>
              ) : (
                <div className="space-y-2">
                  {relatedItems.map((item) => (
                    <a 
                      key={item.id} 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="block group"
                    >
                      <p className="text-[11px] text-ast-text group-hover:text-ast-accent line-clamp-2 leading-tight">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-ast-muted">{item.sources?.name}</span>
                        <span className="text-[9px] text-ast-muted">{getHoursAgo(item.published_at)}</span>
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
  );
}

export function CompanyTray({ items, selectedCompany, onSelectCompany }: CompanyTrayProps) {
  const [activeBasket, setActiveBasket] = useState<string>("AS Interface Index");
  const basketNames = Object.keys(COMPANY_BASKETS);
  const currentBasket = COMPANY_BASKETS[activeBasket] || [];
  
  const selectedCompanyData = useMemo(() => {
    if (!selectedCompany) return null;
    return findCompanyByName(selectedCompany);
  }, [selectedCompany]);

  return (
    <div className="h-full flex flex-col bg-ast-bg">
      {/* Header with basket selector */}
      <div className="h-9 px-3 border-b border-ast-border bg-ast-bg/95 backdrop-blur-sm flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-ast-mint text-xs font-semibold">🏢</span>
          <select
            value={activeBasket}
            onChange={(e) => {
              setActiveBasket(e.target.value);
              onSelectCompany(null);
            }}
            className="bg-transparent text-ast-text text-xs font-medium border-none focus:outline-none cursor-pointer"
          >
            {basketNames.map((name) => (
              <option key={name} value={name} className="bg-ast-bg">
                {name}
              </option>
            ))}
          </select>
        </div>
        {selectedCompany && (
          <button
            onClick={() => onSelectCompany(null)}
            className="text-[10px] text-ast-muted hover:text-ast-text"
          >
            ← Back
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {selectedCompany ? (
          <CompanyDetail 
            companyName={selectedCompany} 
            companyData={selectedCompanyData}
            items={items}
          />
        ) : (
          <div className="p-3 h-full overflow-y-auto">
            <div className="grid grid-cols-3 gap-2">
              {currentBasket.map((company) => (
                <BasketCompanyCard
                  key={company}
                  name={company}
                  isSelected={false}
                  onClick={() => onSelectCompany(company)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
