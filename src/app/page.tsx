'use client';

import { useEffect, useState } from 'react';
import { IGDBCompany } from '@/lib/igdb/types';
import { igdb } from '@/lib/igdb/client';
import { CompanyGrid } from '@/components/companies/CompanyGrid';

export default function Home() {
  const [companies, setCompanies] = useState<IGDBCompany[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCompanies() {
      try {
        const data = await igdb.getTopCompanies();
        setCompanies(data);
      } catch (error) {
        console.error('Failed to load companies:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCompanies();
  }, []);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <main className="min-h-screen">
      <h1 className="text-2xl font-bold p-6">Top Gaming Companies</h1>
      <CompanyGrid companies={companies} />
    </main>
  );
}
