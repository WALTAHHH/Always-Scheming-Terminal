"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { findCompanyByName, type CompanyData } from "@/lib/companies";
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

type ChartRange = "1d" | "1w" | "1mo" | "3mo" | "ytd" | "1y" | "all";

const RANGE_CONFIG: Record<ChartRange, { range: string; label: string }> = {
  "1d": { range: "1d", label: "1D" },
  "1w": { range: "5d", label: "1W" },
  "1mo": { range: "1mo", label: "1M" },
  "3mo": { range: "3mo", label: "3M" },
  "ytd": { range: "ytd", label: "YTD" },
  "1y": { range: "1y", label: "1Y" },
  "all": { range: "5y", label: "ALL" },
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

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── News marker type ──
interface NewsMarker {
  date: string;
  x: number;
  y: number;
  item: FeedItem;
}

// ── Chart skeleton for loading state ──
function ChartSkeleton() {
  return (
    <div className="h-56 w-full relative animate-pulse">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        <path
          d="M 8,70 Q 25,65 35,50 T 55,55 T 75,40 T 92,45"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-ast-border"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-ast-bg to-transparent" />
    </div>
  );
}

interface InteractiveChartProps {
  history: StockHistory[];
  isPositive: boolean;
  currency: string;
  previousClose?: number;
  newsItems?: FeedItem[];
  onHover?: (price: number | null, date: string | null) => void;
  isLoading?: boolean;
}

function InteractiveChart({ 
  history, 
  isPositive, 
  currency, 
  previousClose,
  newsItems = [],
  onHover,
  isLoading 
}: InteractiveChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [activeMarker, setActiveMarker] = useState<NewsMarker | null>(null);

  // Show skeleton while loading
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (history.length < 2) {
    return (
      <div className="h-56 rounded flex items-center justify-center">
        <span className="text-ast-muted text-xs">No chart data</span>
      </div>
    );
  }

  const prices = history.map((h) => h.close);
  const allPrices = previousClose ? [...prices, previousClose] : prices;
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const range = max - min || 1;
  const padding = { top: 12, bottom: 20, left: 8, right: 8 };
  const width = 100;
  const height = 100;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Build points array
  const points = prices.map((price, i) => {
    const x = padding.left + (i / (prices.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((price - min) / range) * chartHeight;
    return { x, y, price, date: history[i].date };
  });

  // Smooth path using cardinal spline (for visual appeal)
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
  
  const color = isPositive ? "#00d4aa" : "#ff6b8a";
  const gradientId = `chartGradient-${isPositive ? "pos" : "neg"}`;

  // Previous close reference line
  const prevCloseY = previousClose 
    ? padding.top + chartHeight - ((previousClose - min) / range) * chartHeight
    : null;

  // Map news items to chart positions
  const newsMarkers: NewsMarker[] = useMemo(() => {
    if (!newsItems.length) return [];
    
    const markers: NewsMarker[] = [];
    const dateMap = new Map(points.map((p, i) => [p.date, { x: p.x, y: p.y, index: i }]));
    
    for (const item of newsItems) {
      if (!item.published_at) continue;
      const itemDate = new Date(item.published_at).toISOString().split("T")[0];
      
      // Find closest date in chart
      let closest = points[0];
      let minDiff = Infinity;
      for (const point of points) {
        const diff = Math.abs(new Date(point.date).getTime() - new Date(itemDate).getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closest = point;
        }
      }
      
      // Only show if within chart range (within 1 day tolerance)
      if (minDiff <= 24 * 60 * 60 * 1000 * 2) {
        markers.push({
          date: itemDate,
          x: closest.x,
          y: closest.y,
          item,
        });
      }
    }
    
    return markers;
  }, [newsItems, points]);

  // Interpolate price at any X position (smooth tracking)
  const interpolateAtX = useCallback((xPos: number): { price: number; date: string; y: number } | null => {
    if (points.length < 2) return null;
    
    // Clamp to chart bounds
    const clampedX = Math.max(padding.left, Math.min(padding.left + chartWidth, xPos));
    
    // Find surrounding points
    let leftIdx = 0;
    for (let i = 0; i < points.length - 1; i++) {
      if (points[i + 1].x >= clampedX) {
        leftIdx = i;
        break;
      }
      leftIdx = i;
    }
    
    const rightIdx = Math.min(leftIdx + 1, points.length - 1);
    const left = points[leftIdx];
    const right = points[rightIdx];
    
    if (left.x === right.x) {
      return { price: left.price, date: left.date, y: left.y };
    }
    
    // Linear interpolation
    const t = (clampedX - left.x) / (right.x - left.x);
    const price = left.price + t * (right.price - left.price);
    const y = left.y + t * (right.y - left.y);
    const date = t < 0.5 ? left.date : right.date;
    
    return { price, date, y };
  }, [points, padding.left, chartWidth]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xPos = ((e.clientX - rect.left) / rect.width) * width;
    
    setHoverX(xPos);
    setActiveMarker(null);
    
    const interpolated = interpolateAtX(xPos);
    if (interpolated && onHover) {
      onHover(interpolated.price, interpolated.date);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length !== 1) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xPos = ((e.touches[0].clientX - rect.left) / rect.width) * width;
    
    setHoverX(xPos);
    setActiveMarker(null);
    
    const interpolated = interpolateAtX(xPos);
    if (interpolated && onHover) {
      onHover(interpolated.price, interpolated.date);
    }
  };

  const handleMouseLeave = () => {
    setHoverX(null);
    setActiveMarker(null);
    if (onHover) onHover(null, null);
  };

  const handleMarkerClick = (marker: NewsMarker, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMarker(activeMarker?.item.id === marker.item.id ? null : marker);
  };

  // Get interpolated position for hover
  const hoverData = hoverX !== null ? interpolateAtX(hoverX) : null;

  return (
    <div className="h-56 w-full relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full transition-opacity duration-300"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseLeave}
        style={{ cursor: "crosshair", touchAction: "none" }}
      >
        {/* Gradient definition */}
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Previous close reference line */}
        {prevCloseY !== null && (
          <>
            <line
              x1={padding.left}
              y1={prevCloseY}
              x2={width - padding.right}
              y2={prevCloseY}
              stroke="#666"
              strokeWidth="1"
              strokeDasharray="3,3"
              vectorEffect="non-scaling-stroke"
              opacity="0.5"
            />
            <text
              x={width - padding.right - 1}
              y={prevCloseY - 2}
              fill="#666"
              fontSize="6"
              textAnchor="end"
              style={{ fontFamily: "system-ui" }}
            >
              Prev
            </text>
          </>
        )}

        {/* Filled area under line */}
        <path
          d={`${pathD} L ${points[points.length - 1].x},${height - padding.bottom} L ${padding.left},${height - padding.bottom} Z`}
          fill={`url(#${gradientId})`}
          className="transition-all duration-500"
        />

        {/* Main price line */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-500"
        />

        {/* News markers */}
        {newsMarkers.map((marker, i) => (
          <g key={marker.item.id} onClick={(e) => handleMarkerClick(marker, e)} style={{ cursor: "pointer" }}>
            {/* Vertical line from point to bottom */}
            <line
              x1={marker.x}
              y1={marker.y}
              x2={marker.x}
              y2={height - padding.bottom}
              stroke="#fbbf24"
              strokeWidth="1"
              strokeDasharray="2,2"
              vectorEffect="non-scaling-stroke"
              opacity="0.6"
            />
            {/* Marker dot */}
            <circle
              cx={marker.x}
              cy={marker.y}
              r="4"
              fill="#fbbf24"
              stroke="#0d1117"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              className="transition-transform hover:scale-150"
            />
          </g>
        ))}

        {/* Hover crosshair and dot (smooth interpolation) */}
        {hoverData && hoverX !== null && (
          <>
            {/* Vertical line */}
            <line
              x1={Math.max(padding.left, Math.min(width - padding.right, hoverX))}
              y1={padding.top}
              x2={Math.max(padding.left, Math.min(width - padding.right, hoverX))}
              y2={height - padding.bottom}
              stroke={color}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              opacity="0.4"
            />
            {/* Dot on line */}
            <circle
              cx={Math.max(padding.left, Math.min(width - padding.right, hoverX))}
              cy={hoverData.y}
              r="5"
              fill={color}
              stroke="#0d1117"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* News marker tooltip */}
      {activeMarker && (
        <div 
          className="absolute z-10 bg-ast-surface border border-ast-border rounded-lg shadow-xl p-3 max-w-[200px]"
          style={{
            left: `${(activeMarker.x / width) * 100}%`,
            top: `${(activeMarker.y / height) * 100}%`,
            transform: "translate(-50%, -120%)",
          }}
        >
          <a 
            href={activeMarker.item.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block text-xs text-ast-text hover:text-ast-accent line-clamp-3"
          >
            {activeMarker.item.title}
          </a>
          <div className="text-[10px] text-ast-muted mt-1">
            {formatDateShort(activeMarker.date)}
          </div>
        </div>
      )}
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
  const [chartRange, setChartRange] = useState<ChartRange>("3mo");
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [pendingRange, setPendingRange] = useState<ChartRange | null>(null);

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
        const res = await fetch(`/api/stock/${companyData.ticker}?range=${config.range}`);
        const data = await res.json();
        setStockData(data);
      } catch {
        setStockData(null);
      } finally {
        setLoading(false);
        setPendingRange(null);
      }
    };

    fetchStock();
  }, [companyData, chartRange]);

  const handleRangeChange = (newRange: ChartRange) => {
    if (newRange === chartRange) return;
    setPendingRange(newRange);
    setChartRange(newRange);
  };

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
          ) : (
            <>
              {/* Price display - show during load too */}
              <div className="px-5 py-4 border-b border-ast-border">
                {loading && !stockData ? (
                  <div className="animate-pulse">
                    <div className="h-8 w-32 bg-ast-surface rounded mb-2" />
                    <div className="h-4 w-24 bg-ast-surface rounded" />
                  </div>
                ) : quote && quote.price != null ? (
                  <>
                    {/* Show hover price or current price */}
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-semibold text-ast-text">
                        {formatCurrency(hoverPrice ?? quote.price, quote.currency)}
                      </span>
                      {hoverPrice === null ? (
                        <span className={isPositive ? "text-ast-mint" : "text-ast-pink"}>
                          {isPositive ? "▲" : "▼"} {formatCurrency(Math.abs(quote.change ?? 0), quote.currency)} ({(quote.changePercent ?? 0).toFixed(2)}%)
                        </span>
                      ) : (
                        <span className="text-ast-muted text-sm">{hoverDate}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-ast-muted text-sm">Unable to load price data</div>
                )}
              </div>

              {/* Stats row */}
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

              {/* Chart section */}
              <div className="px-5 py-4 border-b border-ast-border">
                <InteractiveChart 
                  history={history} 
                  isPositive={isPositive}
                  currency={quote?.currency || "USD"}
                  previousClose={quote?.previousClose}
                  newsItems={relatedItems}
                  isLoading={loading || pendingRange !== null}
                  onHover={(price, date) => {
                    setHoverPrice(price);
                    setHoverDate(date);
                  }}
                />
                
                {/* Range selector - pill style */}
                <div className="flex justify-center gap-1 mt-4 bg-ast-surface/50 rounded-full p-1 mx-auto w-fit">
                  {(Object.keys(RANGE_CONFIG) as ChartRange[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRangeChange(r)}
                      disabled={loading}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                        chartRange === r 
                          ? "bg-ast-accent text-ast-bg shadow-sm" 
                          : "text-ast-muted hover:text-ast-text hover:bg-ast-surface"
                      } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {RANGE_CONFIG[r].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Links */}
              {companyData.irUrl && (
                <div className="px-5 py-3 border-b border-ast-border flex gap-2">
                  <a href={companyData.irUrl} target="_blank" rel="noopener noreferrer" className="flex-1 px-3 py-2 bg-ast-surface border border-ast-border rounded text-xs text-ast-muted hover:text-ast-accent text-center transition-colors">
                    📊 Investor Relations
                  </a>
                  {companyData.secUrl && (
                    <a href={companyData.secUrl} target="_blank" rel="noopener noreferrer" className="flex-1 px-3 py-2 bg-ast-surface border border-ast-border rounded text-xs text-ast-muted hover:text-ast-accent text-center transition-colors">
                      📄 SEC Filings
                    </a>
                  )}
                </div>
              )}

              {/* Coverage section */}
              <div className="px-5 py-4">
                <div className="text-xs text-ast-accent uppercase font-semibold mb-3">
                  Recent Coverage ({relatedItems.length})
                  {relatedItems.length > 0 && (
                    <span className="text-ast-muted font-normal ml-2">· shown on chart</span>
                  )}
                </div>
                {relatedItems.length === 0 ? (
                  <p className="text-ast-muted text-xs">No recent coverage found.</p>
                ) : (
                  <div className="space-y-3">
                    {relatedItems.map((item) => (
                      <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="block group">
                        <div className="flex items-start gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-ast-text group-hover:text-ast-accent line-clamp-2">{item.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-ast-muted">{item.sources?.name}</span>
                              <span className="text-[10px] text-ast-muted">{getHoursAgo(item.published_at)}</span>
                            </div>
                          </div>
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
