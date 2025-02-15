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

  private getImageUrl(imageId: string, size: string = 'logo_med'): string {
    return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
  }

  async getCompany(id: number): Promise<IGDBCompany> {
    const query = `
      fields name, slug, description, developed.*, published.*,
             country, website, logo.image_id, logo.url, logo.width, logo.height; 
      where id = ${id};
    `;
    const [company] = await this.fetchFromIGDB('companies', query);
    if (company.logo?.image_id) {
      company.logo.url = `https://images.igdb.com/igdb/image/upload/t_company_logo/${company.logo.image_id}.png`;
    }
    return company;
  }

  async searchCompanies(search: string): Promise<IGDBCompany[]> {
    const query = `
      fields id, name, slug, description, logo.image_id, logo.url, logo.width, logo.height, developed.*, published.*;
      limit 10;
      where name ~ *"${search}"*;
    `;
    const results = await this.fetchFromIGDB('companies', query);
    return results.map((company: IGDBCompany) => {
      if (company.logo?.image_id) {
        company.logo.url = this.getImageUrl(company.logo.image_id);
      }
      return company;
    });
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

  async getCompanyBySlug(slug: string): Promise<IGDBCompany | null> {
    const query = `
      fields id, name, slug, description, logo.image_id, logo.url, logo.width, logo.height, developed.*, published.*;
      where slug = "${slug}";
      limit 1;
    `;
    const results = await this.fetchFromIGDB('companies', query);
    if (results.length > 0) {
      const company = results[0];
      if (company.logo?.image_id) {
        company.logo.url = this.getImageUrl(company.logo.image_id);
      }
      return company;
    }
    return null;
  }
}

export const igdb = IGDBClient.getInstance(); 