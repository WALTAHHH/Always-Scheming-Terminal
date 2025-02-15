'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { igdb } from '@/lib/igdb/client';
import { yahoo } from '@/lib/yahoo/client';
import { transformCompanyProfile } from '@/lib/igdb/transforms';
import { CompanyHeader } from '@/components/companies/CompanyHeader';
import { PerformanceGraph } from '@/components/companies/PerformanceGraph';
import { IntelligenceFeed } from '@/components/companies/IntelligenceFeed';
import { KeyMetrics } from '@/components/companies/KeyMetrics';
import { Pipeline } from '@/components/companies/Pipeline';
import { IGDBCompany, IGDBGame } from '@/lib/igdb/types';
import { CompanyFinancials } from '@/lib/yahoo/types';

export default function CompanyPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<IGDBCompany | null>(null);
  const [games, setGames] = useState<IGDBGame[]>([]);
  const [financials, setFinancials] = useState<CompanyFinancials | null>(null);

  useEffect(() => {
    async function loadCompanyData() {
      try {
        setLoading(true);
        const slug = params?.slug as string;
        if (!slug) return;

        const companyData = await igdb.getCompanyBySlug(slug);
        if (companyData) {
          setCompany(companyData);
          
          if (companyData.id) {
            const [gamesData, financialsData] = await Promise.all([
              igdb.getCompanyGames(companyData.id),
              yahoo.getFinancials(companyData.id)
            ]);
            setGames(gamesData);
            setFinancials(financialsData);
          }
        }
      } catch (error) {
        console.error('Failed to load company data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCompanyData();
  }, [params?.slug]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!company) {
    return <div className="p-6">Company not found</div>;
  }

  const companyProfile = transformCompanyProfile(company, games, financials);
  const upcomingGames = games
    .filter(game => game.first_release_date != null && game.first_release_date > Date.now() / 1000)
    .map(game => ({
      name: game.name,
      releaseDate: new Date(game.first_release_date! * 1000).toLocaleDateString()
    }));

  return (
    <div className="space-y-6">
      <CompanyHeader {...companyProfile} />
      
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Performance Overview</h2>
            <PerformanceGraph />
          </div>
          
          <div className="bg-white rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Intelligence Feed</h2>
            <IntelligenceFeed />
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-white rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Key Metrics</h2>
            <KeyMetrics 
              marketCap={formatCurrency(financials?.marketCap)}
              revenue={formatCurrency(financials?.revenue)}
              operatingMargin={formatPercentage(financials?.operatingMargin)}
            />
          </div>
          
          <div className="bg-white rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Pipeline</h2>
            <Pipeline games={upcomingGames} />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value?: number): string {
  if (!value) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

function formatPercentage(value?: number): string {
  if (!value) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1
  }).format(value);
} 