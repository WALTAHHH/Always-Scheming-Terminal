import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { rateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// AS Primitives Index companies
const INDEX_COMPANIES = [
  { name: "Apple", ticker: "AAPL", category: "input" },
  { name: "Coinbase", ticker: "COIN", category: "infra" },
  { name: "Google", ticker: "GOOGL", category: "infra" },
  { name: "Meta", ticker: "META", category: "input,interface" },
  { name: "Microsoft", ticker: "MSFT", category: "input,infra" },
  { name: "Nvidia", ticker: "NVDA", category: "infra" },
  { name: "Roblox", ticker: "RBLX", category: "interface,infra" },
  { name: "Samsung", ticker: "005930.KS", category: "input" },
  { name: "Snap", ticker: "SNAP", category: "input,interface" },
  { name: "Sony", ticker: "SONY", category: "input" },
  { name: "Take-Two", ticker: "TTWO", category: "infra" },
  { name: "Tencent", ticker: "0700.HK", category: "infra" },
  { name: "Unity", ticker: "U", category: "interface,infra" },
] as const;

export interface IndexCompanyData {
  name: string;
  ticker: string;
  categories: string[];
  
  // Quote data
  price: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  marketCapUSD: number | null; // Converted to USD for non-US stocks
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  currency: string;
  
  // Fundamentals
  revenue: number | null;
  revenueGrowth: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  evToRevenue: number | null;
  evToEbitda: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  freeCashFlow: number | null;
  beta: number | null;
  
  // Status
  error?: string;
}

export interface IndexResponse {
  companies: IndexCompanyData[];
  aggregate: {
    totalMarketCapUSD: number;
    avgRevenueGrowth: number | null;
    avgGrossMargin: number | null;
    avgOperatingMargin: number | null;
    companiesWithData: number;
  };
  fetchedAt: string;
  cached: boolean;
  error?: string;
}

// Approximate USD conversion rates for non-USD currencies
// In production, you'd fetch these from an FX API
const USD_CONVERSION: Record<string, number> = {
  "KRW": 0.00073,  // Korean Won
  "HKD": 0.128,    // Hong Kong Dollar
  "JPY": 0.0064,   // Japanese Yen
  "EUR": 1.08,     // Euro
  "GBP": 1.27,     // British Pound
  "USD": 1,
};

// Cache
interface CacheEntry {
  data: IndexResponse;
  timestamp: number;
}

let indexCache: CacheEntry | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function fetchCompanyData(
  name: string,
  ticker: string,
  category: string
): Promise<IndexCompanyData> {
  const categories = category.split(",");
  
  try {
    // Fetch quote and fundamentals in parallel
    const [quoteData, summaryData] = await Promise.all([
      yahooFinance.quote(ticker),
      yahooFinance.quoteSummary(ticker, {
        modules: ["financialData", "defaultKeyStatistics"],
      }),
    ]);

    const fd = summaryData.financialData;
    const ks = summaryData.defaultKeyStatistics;
    
    // Convert market cap to USD if needed
    const currency = quoteData.currency || "USD";
    const marketCap = quoteData.marketCap || null;
    const conversionRate = USD_CONVERSION[currency] || 1;
    const marketCapUSD = marketCap ? marketCap * conversionRate : null;

    return {
      name,
      ticker,
      categories,
      
      // Quote
      price: quoteData.regularMarketPrice ?? null,
      change: quoteData.regularMarketChange ?? null,
      changePercent: quoteData.regularMarketChangePercent ?? null,
      marketCap,
      marketCapUSD,
      fiftyTwoWeekHigh: quoteData.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: quoteData.fiftyTwoWeekLow ?? null,
      currency,
      
      // Fundamentals
      revenue: fd?.totalRevenue ?? null,
      revenueGrowth: fd?.revenueGrowth ?? null,
      grossMargin: fd?.grossMargins ?? null,
      operatingMargin: fd?.operatingMargins ?? null,
      profitMargin: fd?.profitMargins ?? null,
      forwardPE: ks?.forwardPE ?? null,
      priceToBook: ks?.priceToBook ?? null,
      evToRevenue: ks?.enterpriseToRevenue ?? null,
      evToEbitda: ks?.enterpriseToEbitda ?? null,
      totalCash: fd?.totalCash ?? null,
      totalDebt: fd?.totalDebt ?? null,
      freeCashFlow: fd?.freeCashflow ?? null,
      beta: ks?.beta ?? null,
    };
  } catch (error) {
    console.error(`Error fetching ${ticker}:`, error);
    return {
      name,
      ticker,
      categories,
      price: null,
      change: null,
      changePercent: null,
      marketCap: null,
      marketCapUSD: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      currency: "USD",
      revenue: null,
      revenueGrowth: null,
      grossMargin: null,
      operatingMargin: null,
      profitMargin: null,
      forwardPE: null,
      priceToBook: null,
      evToRevenue: null,
      evToEbitda: null,
      totalCash: null,
      totalDebt: null,
      freeCashFlow: null,
      beta: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function calculateAggregate(companies: IndexCompanyData[]) {
  const withData = companies.filter((c) => c.marketCapUSD && !c.error);
  
  const totalMarketCapUSD = withData.reduce(
    (sum, c) => sum + (c.marketCapUSD || 0),
    0
  );
  
  const revenueGrowths = withData
    .map((c) => c.revenueGrowth)
    .filter((v): v is number => v !== null);
  const avgRevenueGrowth = revenueGrowths.length
    ? revenueGrowths.reduce((a, b) => a + b, 0) / revenueGrowths.length
    : null;
  
  const grossMargins = withData
    .map((c) => c.grossMargin)
    .filter((v): v is number => v !== null);
  const avgGrossMargin = grossMargins.length
    ? grossMargins.reduce((a, b) => a + b, 0) / grossMargins.length
    : null;
  
  const operatingMargins = withData
    .map((c) => c.operatingMargin)
    .filter((v): v is number => v !== null && v > -1); // Exclude extreme negatives
  const avgOperatingMargin = operatingMargins.length
    ? operatingMargins.reduce((a, b) => a + b, 0) / operatingMargins.length
    : null;

  return {
    totalMarketCapUSD,
    avgRevenueGrowth,
    avgGrossMargin,
    avgOperatingMargin,
    companiesWithData: withData.length,
  };
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<IndexResponse>> {
  // Rate limiting
  const clientIP = getClientIP(request);
  const rateLimitResult = rateLimit(`index:${clientIP}`, RATE_LIMITS.stock);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        companies: [],
        aggregate: {
          totalMarketCapUSD: 0,
          avgRevenueGrowth: null,
          avgGrossMargin: null,
          avgOperatingMargin: null,
          companiesWithData: 0,
        },
        fetchedAt: new Date().toISOString(),
        cached: false,
        error: "Rate limit exceeded",
      },
      { status: 429 }
    );
  }

  // Check cache
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";
  
  if (!forceRefresh && indexCache && Date.now() - indexCache.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...indexCache.data, cached: true });
  }

  // Fetch all companies in parallel (with small stagger to avoid rate limits)
  const companyPromises = INDEX_COMPANIES.map(async (company, index) => {
    // Stagger requests by 100ms each to avoid hitting rate limits
    await new Promise((resolve) => setTimeout(resolve, index * 100));
    return fetchCompanyData(company.name, company.ticker, company.category);
  });

  const companies = await Promise.all(companyPromises);
  const aggregate = calculateAggregate(companies);

  const response: IndexResponse = {
    companies,
    aggregate,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };

  // Cache the response
  indexCache = { data: response, timestamp: Date.now() };

  return NextResponse.json(response);
}
