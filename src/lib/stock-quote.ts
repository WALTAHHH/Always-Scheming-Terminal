/**
 * Pure helpers for turning Yahoo Finance responses into the app's stock quote
 * shape. Kept out of `src/app/api/stock/[ticker]/route.ts` (a Next.js route file
 * may only export route handlers) so the fallback logic is unit-testable.
 *
 * Background: the Yahoo *quote* endpoint intermittently returns nothing for
 * symbols that are delisted, recently halted, or only still served by the
 * *chart* endpoint. Those responses used to surface as
 * `{ error: "No quote data" }`, which the TickerBar logged as a failed fetch
 * ("Failed to fetch EA: Error: No quote data"). We instead recover a usable
 * quote from the chart meta when possible, and otherwise report a clean,
 * non-error "unavailable" result so the UI renders a placeholder quietly.
 */

export interface StockQuoteFields {
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

/** The subset of the Yahoo chart response `meta` block that we consume. */
export interface ChartMeta {
  symbol?: string | null;
  currency?: string | null;
  exchangeName?: string | null;
  regularMarketPrice?: number | null;
  regularMarketChange?: number | null;
  regularMarketChangePercent?: number | null;
  chartPreviousClose?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * True when the Yahoo *quote* endpoint actually returned a price.
 *
 * Yahoo answers with `{}` (no throw, no price) for symbols it no longer covers
 * — `EA`, `WBD` and `DEVO.L` all do this on origin/main. A bare truthiness check
 * treats that empty object as a successful quote and the UI then renders a $0
 * price, so callers must gate on a real price and fall back to the chart meta.
 */
export function quoteHasPrice(quote: unknown): boolean {
  if (!quote || typeof quote !== "object") return false;
  const price = num((quote as { regularMarketPrice?: unknown }).regularMarketPrice);
  return price !== null && price > 0;
}

/**
 * True when Yahoo reports a symbol has no data (delisted / renamed / unknown)
 * rather than a genuine transport or permission failure. These are expected for
 * a handful of stale tickers and must not be surfaced as fetch errors.
 */
export function isUnavailableSymbolMessage(message: unknown): boolean {
  const text = String(message ?? "").toLowerCase();
  return (
    text.includes("no data found") ||
    text.includes("delisted") ||
    text.includes("no quote data")
  );
}

/**
 * Build a quote from the chart endpoint's `meta` block.
 *
 * Fallback path for a symbol the quote endpoint returns nothing for but the
 * chart endpoint still serves (e.g. a recently halted/delisted ticker that
 * keeps a frozen last price). Returns `null` when the meta carries no usable
 * price, so the caller can fall back to the "unavailable" state.
 */
export function buildQuoteFromChartMeta(
  ticker: string,
  meta: ChartMeta | null | undefined
): StockQuoteFields | null {
  const price = num(meta?.regularMarketPrice);
  if (price === null) return null;

  return {
    ticker: meta?.symbol ?? ticker,
    price,
    change: num(meta?.regularMarketChange) ?? 0,
    changePercent: num(meta?.regularMarketChangePercent) ?? 0,
    marketCap: 0, // not present on the chart meta block
    previousClose: num(meta?.chartPreviousClose) ?? 0,
    fiftyTwoWeekHigh: num(meta?.fiftyTwoWeekHigh) ?? 0,
    fiftyTwoWeekLow: num(meta?.fiftyTwoWeekLow) ?? 0,
    currency: meta?.currency ?? "USD",
    exchange: meta?.exchangeName ?? "",
  };
}
