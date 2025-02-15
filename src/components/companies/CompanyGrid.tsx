'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { IGDBCompany } from '@/lib/igdb/types';
import { useState } from 'react';

interface CompanyGridProps {
  companies: IGDBCompany[];
}

export const CompanyGrid = ({ companies }: CompanyGridProps) => {
  const router = useRouter();
  const [imageError, setImageError] = useState<Record<number, boolean>>({});

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 p-6">
      {companies.map((company) => (
        <div
          key={company.id}
          onClick={() => router.push(`/companies/${company.slug}`)}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 cursor-pointer 
                     hover:shadow-lg transition-shadow duration-200 flex flex-col"
        >
          <div className="flex flex-col items-center">
            {company.logo?.url && !imageError[company.id] ? (
              <div className="h-[120px] flex items-center justify-center mb-3">
                <img
                  src={company.logo.url}
                  alt={`${company.name} logo`}
                  className="max-h-[120px] w-auto"
                  onError={() => setImageError(prev => ({ ...prev, [company.id]: true }))}
                />
              </div>
            ) : (
              <div className="w-32 h-32 bg-gray-200 dark:bg-gray-700 rounded-lg 
                            flex items-center justify-center text-4xl text-gray-400">
                {company.name.charAt(0)}
              </div>
            )}
            <h3 className="text-lg font-semibold text-center">{company.name}</h3>
          </div>

          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300 mt-3">
            <div className="flex justify-between">
              <span>Developed:</span>
              <span className="font-medium">{company.developed?.length || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Published:</span>
              <span className="font-medium">{company.published?.length || 0}</span>
            </div>
          </div>

          {company.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mt-3">
              {company.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}; 