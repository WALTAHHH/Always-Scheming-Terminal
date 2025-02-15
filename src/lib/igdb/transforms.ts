import { IGDBCompany, IGDBGame } from './types';

export interface CompanyProfile {
  id: number;
  name: string;
  ticker?: string; // We'll need to maintain a mapping for this
  logo?: string;
  metrics: {
    activeGames: number;
    monthlyPlayers: number; // We'll need to estimate this
    yearGrowth: number; // We'll calculate this from historical data
  };
  performance: 'Strong' | 'Moderate' | 'Weak';
}

export function transformCompanyProfile(
  company: IGDBCompany, 
  games: IGDBGame[]
): CompanyProfile {
  const activeGames = games.length;
  
  // This is a placeholder calculation - we'd need real data for better metrics
  const monthlyPlayers = Math.floor(Math.random() * 1000); // Mock data
  const yearGrowth = Math.floor(Math.random() * 30); // Mock data
  
  const performance = yearGrowth > 20 ? 'Strong' : 
                     yearGrowth > 10 ? 'Moderate' : 'Weak';

  return {
    id: company.id,
    name: company.name,
    ticker: 'TBD',  // Add default ticker
    logo: company.logo?.url,
    metrics: {
      activeGames,
      monthlyPlayers,
      yearGrowth
    },
    performance
  };
} 