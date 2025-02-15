'use client';

import { useEffect, useState } from 'react';
import { igdb } from '@/lib/igdb/client';
import { transformCompanyProfile } from '@/lib/igdb/transforms';
import { CompanyHeader } from '@/components/companies/CompanyHeader';
import { PerformanceGraph } from '@/components/companies/PerformanceGraph';
import { IntelligenceFeed } from '@/components/companies/IntelligenceFeed';
import { KeyMetrics } from '@/components/companies/KeyMetrics';
import { Pipeline } from '@/components/companies/Pipeline';

export default function CompanyPage({ params }: { params: { slug: string } }) {
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [games, setGames] = useState<any[]>([]);

  useEffect(() => {
    async function loadCompanyData() {
      try {
        // First get company data
        const companies = await igdb.searchCompanies(params.slug);
        if (companies && companies.length > 0) {
          const companyData = companies[0];
          setCompany(companyData);
          
          // Then get their games
          const gamesData = await igdb.getCompanyGames(companyData.id);
          setGames(gamesData);
        }
      } catch (error) {
        console.error('Failed to load company data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCompanyData();
  }, [params.slug]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!company) {
    return <div className="p-6">Company not found</div>;
  }

  const companyProfile = transformCompanyProfile(company, games);
  const upcomingGames = games
    .filter(game => game.first_release_date > Date.now() / 1000)
    .map(game => ({
      name: game.name,
      releaseDate: new Date(game.first_release_date * 1000).toLocaleDateString()
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
              marketCap="TBD"
              revenue="TBD"
              operatingMargin="TBD"
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