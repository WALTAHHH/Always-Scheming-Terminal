import { NextRequest, NextResponse } from "next/server";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
): Promise<NextResponse<StockResponse>> {
  const { ticker } = await params;
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "1mo";
  const interval = searchParams.get("interval") || "1d";

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json({ quote: null, history: [], error: `HTTP ${res.status}` });
    }

    const data = await res.json();
    const result = data.chart?.result?.[0];
    const meta = result?.meta;

    if (!meta) {
      return NextResponse.json({ quote: null, history: [], error: "No data" });
    }

    const quote: StockQuote = {
      ticker: meta.symbol,
      price: meta.regularMarketPrice,
      change: meta.regularMarketPrice - meta.previousClose,
      changePercent: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100,
      marketCap: meta.marketCap || 0,
      previousClose: meta.previousClose,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow || 0,
      currency: meta.currency || "USD",
      exchange: meta.exchangeName || meta.exchange,
    };

    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const history: StockHistory[] = timestamps
      .map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString().split("T")[0],
        close: closes[i],
      }))
      .filter((h: StockHistory) => h.close !== null);

    return NextResponse.json({ quote, history });
  } catch (error) {
    return NextResponse.json({
      quote: null,
      history: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
