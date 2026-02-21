import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { rateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";

const yahooFinance = new YahooFinance();

// Yahoo Finance quote response shape (fields we use)
interface YahooQuote {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  regularMarketPreviousClose?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  currency?: string;
  exchange?: string;
}

// Yahoo Finance chart response shape
interface YahooChartQuote {
  date: Date | string;
  close?: number | null;
}

interface YahooChart {
  quotes?: YahooChartQuote[];
}

export interface StockQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  previousClose: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  currency: string;
  exchange: string;
}

export interface StockHistory {
  date: string;
  close: number;
}

export interface StockResponse {
  quote: StockQuote | null;
  history: StockHistory[];
  error?: string;
  cached?: boolean;
}

// ── In-memory cache ──
interface CacheEntry {
  data: StockResponse;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

// Cache TTL by range (in ms)
const CACHE_TTL: Record<string, number> = {
  "1d": 2 * 60 * 1000,      // 2 min for intraday
  "5d": 5 * 60 * 1000,      // 5 min for 1 week
  "1mo": 5 * 60 * 1000,     // 5 min
  "3mo": 10 * 60 * 1000,    // 10 min
  "ytd": 10 * 60 * 1000,    // 10 min
  "1y": 15 * 60 * 1000,     // 15 min
  "5y": 30 * 60 * 1000,     // 30 min for long-term
};

function getCacheKey(ticker: string, range: string): string {
  return `${ticker.toUpperCase()}:${range}`;
}

function getFromCache(key: string, ttl: number): StockResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  
  return { ...entry.data, cached: true };
}

function setCache(key: string, data: StockResponse): void {
  cache.set(key, { data, timestamp: Date.now() });
  
  // Prune old entries if cache gets too large (> 100 entries)
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.timestamp > 30 * 60 * 1000) {
        cache.delete(k);
      }
    }
  }
}

// Helper to get start of year
function getYTDStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

// Map range strings to yahoo-finance2 period format
const RANGE_MAP: Record<string, { period1: Date; interval: "1d" | "1wk" | "1mo" | "1h" | "5m" }> = {
  "1d": { period1: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), interval: "5m" },
  "5d": { period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), interval: "1h" },
  "1mo": { period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), interval: "1d" },
  "3mo": { period1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), interval: "1d" },
  "ytd": { period1: getYTDStart(), interval: "1d" },
  "1y": { period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), interval: "1wk" },
  "5y": { period1: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000), interval: "1mo" },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
): Promise<NextResponse<StockResponse | { error: string }>> {
  // Rate limiting
  const clientIP = getClientIP(request);
  const rateLimitResult = rateLimit(`stock:${clientIP}`, RATE_LIMITS.stock);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { 
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimitResult.resetTime),
          "Retry-After": String(Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)),
        }
      }
    );
  }

  const { ticker } = await params;
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "1mo";

  const cacheKey = getCacheKey(ticker, range);
  const ttl = CACHE_TTL[range] || CACHE_TTL["1mo"];

  // Check cache first
  const cached = getFromCache(cacheKey, ttl);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    // Fetch quote and historical data using yahoo-finance2
    const [quoteData, chartData] = await Promise.all([
      yahooFinance.quote(ticker),
      yahooFinance.chart(ticker, {
        period1: RANGE_MAP[range]?.period1 || RANGE_MAP["1mo"].period1,
        interval: RANGE_MAP[range]?.interval || "1d",
      }),
    ]);

    if (!quoteData) {
      return NextResponse.json({ quote: null, history: [], error: "No quote data" });
    }

    const q = quoteData as YahooQuote;
    const quote: StockQuote = {
      ticker: q.symbol || ticker,
      price: q.regularMarketPrice || 0,
      change: q.regularMarketChange || 0,
      changePercent: q.regularMarketChangePercent || 0,
      marketCap: q.marketCap || 0,
      previousClose: q.regularMarketPreviousClose || 0,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow || 0,
      currency: q.currency || "USD",
      exchange: q.exchange || "",
    };

    const chart = chartData as YahooChart;
    const history: StockHistory[] = (chart.quotes || [])
      .filter((item): item is YahooChartQuote & { close: number } => 
        item.close !== null && item.close !== undefined
      )
      .map((item) => ({
        date: new Date(item.date).toISOString().split("T")[0],
        close: item.close,
      }));

    const response: StockResponse = { quote, history };
    
    // Cache successful responses
    setCache(cacheKey, response);

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Stock API error for ${ticker}:`, error);
    return NextResponse.json({
      quote: null,
      history: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
