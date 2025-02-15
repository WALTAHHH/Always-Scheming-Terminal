import { MetricItem } from '@/components/companies/MetricItem';

interface CompanyHeaderProps {
  name: string;
  ticker?: string;
  logo?: string;
  metrics: {
    activeGames: number;
    monthlyPlayers: number;
    yearGrowth: number;
  };
  performance?: 'Strong' | 'Moderate' | 'Weak';
}

export const CompanyHeader = ({ name, ticker, logo, metrics, performance = 'Strong' }: CompanyHeaderProps) => {
  const performanceColors = {
    Strong: 'bg-green-50 text-green-700',
    Moderate: 'bg-yellow-50 text-yellow-700',
    Weak: 'bg-red-50 text-red-700'
  };

  return (
    <div className="bg-white rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-32 h-32 bg-gray-100 rounded-lg flex items-center justify-center">
            {logo ? (
              <div className="h-[120px] flex items-center justify-center">
                <img 
                  src={logo} 
                  alt={name} 
                  className="max-h-[120px] w-auto"
                />
              </div>
            ) : (
              <span className="text-4xl text-gray-400">{name.charAt(0)}</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">{name}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${performanceColors[performance]}`}>
                {performance} Performance
              </span>
            </div>
            {ticker && <p className="text-gray-500">NASDAQ: {ticker}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-50">
            Add to Watchlist
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Generate Report
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-6 mt-6">
        <MetricItem 
          icon="game"
          label="Active Games" 
          value={metrics.activeGames} 
        />
        <MetricItem 
          icon="users"
          label="Monthly Players" 
          value={`${metrics.monthlyPlayers}M`} 
        />
        <MetricItem 
          icon="trend"
          label="YoY Growth" 
          value={`+${metrics.yearGrowth}%`}
          trend="up"
        />
      </div>
    </div>
  );
}; 