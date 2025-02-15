import { IGDBGame, IGDBCompany } from '@/lib/igdb/types';

const TWITCH_CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

class IGDBClient {
  private static instance: IGDBClient;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  private constructor() {}

  static getInstance(): IGDBClient {
    if (!IGDBClient.instance) {
      IGDBClient.instance = new IGDBClient();
    }
    return IGDBClient.instance;
  }

  private async getAccessToken(): Promise<string> {
    console.log('Attempting to get access token...');
    console.log('Client ID:', TWITCH_CLIENT_ID);
    console.log('Client Secret:', TWITCH_CLIENT_SECRET?.substring(0, 4) + '...');
    
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const url = `https://id.twitch.tv/oauth2/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials'
      })
    });

    const data = await response.json();
    console.log('Token response:', data);
    
    if (!data.access_token) {
      throw new Error('Failed to get access token');
    }
    
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
    return data.access_token;
  }

  private async fetchFromIGDB(endpoint: string, query: string): Promise<any> {
    const response = await fetch('/api/igdb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint,
        query,
      })
    });

    if (!response.ok) {
      throw new Error(`IGDB API error: ${response.status}`);
    }

    return response.json();
  }

  async getCompany(id: number): Promise<IGDBCompany> {
    const query = `
      fields name, slug, description, developed.*, published.*,
             country, website, logo.*; 
      where id = ${id};
    `;
    const [company] = await this.fetchFromIGDB('companies', query);
    return company;
  }

  async searchCompanies(search: string): Promise<IGDBCompany[]> {
    const query = `
      fields id, name, slug, description;
      limit 10;
      where name ~ *"${search}"*;
    `;
    console.log('IGDB Query:', query);
    const results = await this.fetchFromIGDB('companies', query);
    console.log('Raw IGDB Response:', results);
    return results;
  }

  async getCompanyGames(companyId: number): Promise<IGDBGame[]> {
    const query = `
      fields name, slug, cover.*, first_release_date, rating,
             platforms.*, genres.*, involved_companies.*;
      where involved_companies.company = ${companyId};
      limit 50;
    `;
    return this.fetchFromIGDB('games', query);
  }
}

export const igdb = IGDBClient.getInstance(); 