import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level regression tests for the Admin → Entities ticker-fetch errors.
 *
 * The TickerBar renders `{ error }` responses as a failed fetch
 * ("Failed to fetch EA: Error: No quote data"). These tests pin the two Yahoo
 * shapes that produced those errors on origin/main, plus the genuine-fault path
 * that must still surface an error.
 */

const yahoo = vi.hoisted(() => ({ quote: vi.fn(), chart: vi.fn() }));

vi.mock("yahoo-finance2", () => ({
  default: class MockYahooFinance {
    quote = yahoo.quote;
    chart = yahoo.chart;
  },
}));

import { GET } from "./route";

function call(ticker: string) {
  const req = new Request(`http://localhost/api/stock/${ticker}?range=1d`);
  return GET(req as never, { params: Promise.resolve({ ticker }) });
}

const CHART_META = {
  symbol: "EA",
  currency: "USD",
  exchangeName: "NMS",
  regularMarketPrice: 209.7,
  regularMarketChange: 0,
  regularMarketChangePercent: 0,
  chartPreviousClose: 0,
  fiftyTwoWeekHigh: 210.2,
  fiftyTwoWeekLow: 141.4,
};

beforeEach(() => {
  yahoo.quote.mockReset();
  yahoo.chart.mockReset();
});

describe("GET /api/stock/[ticker]", () => {
  it("recovers a price when the quote endpoint resolves to {} (EA/WBD/DEVO.L)", async () => {
    yahoo.quote.mockResolvedValue({});
    yahoo.chart.mockResolvedValue({ meta: CHART_META, quotes: [] });

    const res = await call("EA");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.unavailable).toBeUndefined();
    expect(body.quote.price).toBe(209.7);
    expect(body.quote.ticker).toBe("EA");
  });

  it("reports a delisted symbol as unavailable instead of an error (EMBRACB.ST/KWS.L)", async () => {
    const delisted = new Error("No data found, symbol may be delisted");
    yahoo.quote.mockRejectedValue(delisted);
    yahoo.chart.mockRejectedValue(delisted);

    const res = await call("KWS.L");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.unavailable).toBe(true);
    expect(body.quote).toBeNull();
    expect(body.history).toEqual([]);
  });

  it("keeps chart history when only the quote endpoint fails", async () => {
    yahoo.quote.mockRejectedValue(new Error("No data found, symbol may be delisted"));
    yahoo.chart.mockResolvedValue({
      meta: { symbol: "EMBRAC-B.ST", regularMarketPrice: 99.26, currency: "SEK" },
      quotes: [
        { date: new Date("2026-11-18T00:00:00Z"), close: 98.1 },
        { date: new Date("2026-11-19T00:00:00Z"), close: 99.26 },
      ],
    });

    const body = await (await call("EMBRAC-B.ST")).json();

    expect(body.error).toBeUndefined();
    expect(body.quote.price).toBe(99.26);
    expect(body.quote.currency).toBe("SEK");
    expect(body.history).toHaveLength(2);
  });

  it("still surfaces a genuine upstream fault as an error", async () => {
    yahoo.quote.mockRejectedValue(new Error("fetch failed"));
    yahoo.chart.mockRejectedValue(new Error("fetch failed"));

    const body = await (await call("MSFT")).json();

    expect(body.quote).toBeNull();
    expect(body.unavailable).toBeUndefined();
    expect(body.error).toBe("fetch failed");
  });
});