import { describe, it, expect } from "vitest";
import {
  buildQuoteFromChartMeta,
  isUnavailableSymbolMessage,
  quoteHasPrice,
} from "./stock-quote";
import { rateLimit, RATE_LIMITS } from "./rate-limit";

/**
 * Regression tests for the Admin → Entities ticker-fetch errors.
 *
 * Reproduced on origin/main against live Yahoo: the header TickerBar issues one
 * `/api/stock/<ticker>` request per public entity (45 today). Of those 45, 19
 * reported failure — 15 × HTTP 429 (rate limit) plus 4 tickers that came back
 * as a fetch error from Yahoo:
 *
 *   Failed to fetch EA: Error: No quote data
 *   Failed to fetch DEVO.L: Error: No quote data
 *   Failed to fetch EMBRACB.ST: Error: No data found, symbol may be delisted
 *   Failed to fetch KWS.L: Error: No data found, symbol may be delisted
 */

describe("quoteHasPrice", () => {
  it("rejects the empty object Yahoo returns for uncovered symbols", () => {
    // yahooFinance.quote("EA") resolves to {} — no throw, no price.
    expect(quoteHasPrice({})).toBe(false);
  });

  it("rejects missing/undefined/non-numeric prices", () => {
    expect(quoteHasPrice(undefined)).toBe(false);
    expect(quoteHasPrice(null)).toBe(false);
    expect(quoteHasPrice({ regularMarketPrice: undefined })).toBe(false);
    expect(quoteHasPrice({ regularMarketPrice: 0 })).toBe(false);
    expect(quoteHasPrice({ regularMarketPrice: Number.NaN })).toBe(false);
    expect(quoteHasPrice({ regularMarketPrice: "209.7" })).toBe(false);
  });

  it("accepts a real price", () => {
    expect(quoteHasPrice({ regularMarketPrice: 209.7 })).toBe(true);
  });
});

describe("buildQuoteFromChartMeta", () => {
  it("recovers a quote from chart meta when the quote endpoint has nothing", () => {
    // Exact shape Yahoo returns for chart("EA").
    const quote = buildQuoteFromChartMeta("EA", {
      symbol: "EA",
      currency: "USD",
      exchangeName: "NMS",
      regularMarketPrice: 209.7,
      regularMarketChange: 0,
      regularMarketChangePercent: 0,
      chartPreviousClose: 0,
      fiftyTwoWeekHigh: 210.2,
      fiftyTwoWeekLow: 141.4,
    });

    expect(quote).toEqual({
      ticker: "EA",
      price: 209.7,
      change: 0,
      changePercent: 0,
      marketCap: 0,
      previousClose: 0,
      fiftyTwoWeekHigh: 210.2,
      fiftyTwoWeekLow: 141.4,
      currency: "USD",
      exchange: "NMS",
    });
  });

  it("falls back to the requested ticker and USD when meta omits them", () => {
    const quote = buildQuoteFromChartMeta("WBD", { regularMarketPrice: 30.95 });
    expect(quote?.ticker).toBe("WBD");
    expect(quote?.currency).toBe("USD");
    expect(quote?.exchange).toBe("");
  });

  it("returns null when the meta has no usable price (symbol is gone)", () => {
    expect(buildQuoteFromChartMeta("KWS.L", undefined)).toBeNull();
    expect(buildQuoteFromChartMeta("KWS.L", {})).toBeNull();
    expect(buildQuoteFromChartMeta("KWS.L", { regularMarketPrice: null })).toBeNull();
  });
});

describe("isUnavailableSymbolMessage", () => {
  it("treats Yahoo's delisted-symbol throw as 'unavailable', not a fault", () => {
    // Thrown by yahooFinance.chart("EMBRACB.ST") / ("KWS.L") / ("TM17.L").
    expect(isUnavailableSymbolMessage("No data found, symbol may be delisted")).toBe(true);
    expect(isUnavailableSymbolMessage("Error: No data found, symbol may be delisted")).toBe(true);
  });

  it("treats the legacy 'No quote data' text as 'unavailable'", () => {
    expect(isUnavailableSymbolMessage("No quote data")).toBe(true);
  });

  it("does NOT swallow genuine transport/rate-limit faults", () => {
    expect(isUnavailableSymbolMessage("fetch failed")).toBe(false);
    expect(isUnavailableSymbolMessage("Request failed with status code 429")).toBe(false);
    expect(isUnavailableSymbolMessage("Unknown error")).toBe(false);
    expect(isUnavailableSymbolMessage(undefined)).toBe(false);
  });
});

describe("stock rate limit vs the ticker bar fan-out", () => {
  it("admits a full bar load (one request per public ticker, 45 tickers)", () => {
    // The TickerBar fires all tickers in parallel via Promise.allSettled. At the
    // old 30/min budget a third of them returned HTTP 429 on every page load.
    const ip = `fan-out-${Math.random()}`;
    for (let i = 0; i < 45; i++) {
      expect(rateLimit(`stock:${ip}`, RATE_LIMITS.stock).success).toBe(true);
    }
  });

  it("still rejects a runaway client well past the fan-out size", () => {
    const ip = `runaway-${Math.random()}`;
    for (let i = 0; i < RATE_LIMITS.stock.maxRequests; i++) {
      rateLimit(`stock:${ip}`, RATE_LIMITS.stock);
    }
    expect(rateLimit(`stock:${ip}`, RATE_LIMITS.stock).success).toBe(false);
  });
});