import { NextRequest, NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

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
}

// Map range strings to yahoo-finance2 period format
const RANGE_MAP: Record<string, { period1: Date; interval: "1d" | "1wk" | "1mo" }> = {
  "5d": { period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), interval: "1d" },
  "1mo": { period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), interval: "1d" },
  "6mo": { period1: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), interval: "1d" },
  "1y": { period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), interval: "1wk" },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
): Promise<NextResponse<StockResponse>> {
  const { ticker } = await params;
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "1mo";

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = quoteData as any;
    const quote: StockQuote = {
      ticker: q.symbol,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chart = chartData as any;
    const history: StockHistory[] = (chart.quotes || [])
      .filter((q: { close?: number | null }) => q.close !== null && q.close !== undefined)
      .map((q: { date: Date | string; close: number }) => ({
        date: new Date(q.date).toISOString().split("T")[0],
        close: q.close as number,
      }));

    return NextResponse.json({ quote, history });
  } catch (error) {
    console.error(`Stock API error for ${ticker}:`, error);
    return NextResponse.json({
      quote: null,
      history: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
