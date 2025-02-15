import { CompanyFinancials } from '@/lib/alpha/types';
import { getCompanyMapping } from '@/lib/alpha/mapping';

class AlphaVantageClient {
  private static instance: AlphaVantageClient;
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL = 12000; // 12 seconds between requests (5 requests per minute)
  
  private constructor() {}

  private async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  static getInstance(): AlphaVantageClient {
    if (!AlphaVantageClient.instance) {
      AlphaVantageClient.instance = new AlphaVantageClient();
    }
    return AlphaVantageClient.instance;
  }

  async getFinancials(igdbId: number): Promise<CompanyFinancials | null> {
    try {
      await this.waitForRateLimit();
      const mapping = getCompanyMapping(igdbId);
      console.log('Company mapping lookup:', { 
        igdbId, 
        mapping,
        allMappings: require('@/lib/alpha/mapping').companyMappings 
      });
      
      if (!mapping) {
        console.warn(`No mapping found for IGDB ID: ${igdbId}`);
        return null;
      }

      console.log('Making request with ticker:', mapping.ticker);
      const requestUrl = `/api/alpha?symbol=${mapping.ticker}`;
      console.log('Request URL:', requestUrl);
      const response = await fetch(requestUrl);

      const responseText = await response.text();
      console.log('Raw Alpha Vantage Response:', responseText);

      if (!response.ok) {
        console.error('Alpha Vantage API error:', responseText);
        throw new Error(`Alpha Vantage API error: ${response.status} - ${responseText}`);
      }

      const data = JSON.parse(responseText);
      console.log('Parsed Alpha Vantage Response:', data);
      
      if (!data.MarketCapitalization) {
        console.warn('No market cap data found in response');
        console.log('Full response data:', data);
      }

      return {
        ticker: mapping.ticker,
        marketCap: parseFloat(data.MarketCapitalization) || 0,
        revenue: parseFloat(data.RevenueTTM) || 0,
        operatingMargin: parseFloat(data.OperatingMarginTTM) || 0
      };
    } catch (error) {
      console.error('Error in getFinancials:', error);
      throw error;
    }
  }
}

export const alpha = AlphaVantageClient.getInstance(); 