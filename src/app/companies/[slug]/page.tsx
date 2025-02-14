import { CompanyHeader } from '@/components/companies/CompanyHeader';
import { PerformanceGraph } from '@/components/companies/PerformanceGraph';
import { IntelligenceFeed } from '@/components/companies/IntelligenceFeed';
import { KeyMetrics } from '@/components/companies/KeyMetrics';
import { Pipeline } from '@/components/companies/Pipeline';

export default function CompanyPage() {
  // Mock data for now
  const companyData = {
    name: "Electronic Arts",
    ticker: "EA",
    metrics: {
      activeGames: 24,
      monthlyPlayers: 294,
      yearGrowth: 12
    }
  };

  return (
    <div className="space-y-6">
      <CompanyHeader {...companyData} />
      
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
              marketCap="$36.2B"
              revenue="$7.32B"
              operatingMargin="28.4%"
            />
          </div>
          
          <div className="bg-white rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Pipeline</h2>
            <Pipeline 
              games={[
                { name: "Star Wars: Dark Forces", releaseDate: "Q3 2025" },
                { name: "FIFA 25", releaseDate: "Q4 2025" }
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
} 