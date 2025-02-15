import { CompanyFinancials } from '@/lib/yahoo/types';
import { getCompanyMapping } from '@/lib/yahoo/mapping';

class YahooFinanceClient {
  private static instance: YahooFinanceClient;
  
  private constructor() {}

  static getInstance(): YahooFinanceClient {
    if (!YahooFinanceClient.instance) {
      YahooFinanceClient.instance = new YahooFinanceClient();
    }
    return YahooFinanceClient.instance;
  }

  async getFinancials(igdbId: number): Promise<CompanyFinancials | null> {
    const mapping = getCompanyMapping(igdbId);
    if (!mapping) return null;

    const response = await fetch('/api/yahoo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ symbol: mapping.ticker }),
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      ticker: mapping.ticker,
      marketCap: data.price?.marketCap?.raw || 0,
      revenue: data.financialData?.totalRevenue?.raw || 0,
      operatingMargin: data.financialData?.operatingMargins?.raw || 0,
    };
  }
}

export const yahoo = YahooFinanceClient.getInstance(); 