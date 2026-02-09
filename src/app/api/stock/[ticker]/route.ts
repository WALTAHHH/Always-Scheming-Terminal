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

    const quote: StockQuote = {
      ticker: quoteData.symbol,
      price: quoteData.regularMarketPrice || 0,
      change: quoteData.regularMarketChange || 0,
      changePercent: quoteData.regularMarketChangePercent || 0,
      marketCap: quoteData.marketCap || 0,
      previousClose: quoteData.regularMarketPreviousClose || 0,
      fiftyTwoWeekHigh: quoteData.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: quoteData.fiftyTwoWeekLow || 0,
      currency: quoteData.currency || "USD",
      exchange: quoteData.exchange || "",
    };

    const history: StockHistory[] = (chartData.quotes || [])
      .filter((q) => q.close !== null && q.close !== undefined)
      .map((q) => ({
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
