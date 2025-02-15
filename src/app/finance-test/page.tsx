'use client';

import { yahoo } from '@/lib/yahoo/client';
import { useState } from 'react';

export default function FinanceTest() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testApi = async () => {
    try {
      setLoading(true);
      setError(null);
      // Testing with Nintendo's ID from our mapping
      const financials = await yahoo.getFinancials(51);
      setResult(financials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <button 
        onClick={testApi}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        disabled={loading}
      >
        Test Yahoo Finance API
      </button>

      {loading && <p className="mt-4">Loading...</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {result && (
        <pre className="mt-4 p-4 bg-gray-100 rounded-lg overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
} 