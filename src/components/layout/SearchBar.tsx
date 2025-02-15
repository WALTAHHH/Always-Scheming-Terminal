'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { igdb } from '@/lib/igdb/client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IGDBCompany } from '@/lib/igdb/types';

export const SearchBar = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IGDBCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSearch = async (value: string) => {
    setQuery(value);
    console.log('Searching for:', value);
    
    if (value.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      console.log('Fetching companies...');
      const companies = await igdb.searchCompanies(value);
      console.log('Search results:', companies);
      setResults(companies);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompanySelect = (company: IGDBCompany) => {
    router.push(`/companies/${company.slug}`);
  };

  return (
    <div className="relative flex-1 max-w-2xl">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search companies, games, trends..."
        className="w-full px-4 py-2 pl-10 rounded-lg bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <MagnifyingGlassIcon 
        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
      />
      
      {results.length > 0 && (
        <div className="absolute w-full mt-1 bg-white border rounded-lg shadow-lg z-50">
          {results.map((company) => (
            <div
              key={company.id}
              onClick={() => handleCompanySelect(company)}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
            >
              {company.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};