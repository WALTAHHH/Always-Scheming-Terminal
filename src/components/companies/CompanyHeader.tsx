interface CompanyHeaderProps {
  name: string;
  ticker: string;
  logo?: string;
  metrics: {
    activeGames: number;
    monthlyPlayers: number;
    yearGrowth: number;
  };
}

export const CompanyHeader = ({ name, ticker, logo, metrics }: CompanyHeaderProps) => {
  return (
    <div className="p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gray-100 rounded-lg" /* Company logo */ />
        <div>
          <h1 className="text-xl font-semibold">{name}</h1>
          <p className="text-gray-500">NASDAQ: {ticker}</p>
        </div>
        <div className="flex gap-8 ml-8">
          <MetricItem label="Active Games" value={metrics.activeGames} />
          <MetricItem label="Monthly Players" value={`${metrics.monthlyPlayers}M`} />
          <MetricItem label="YoY Growth" value={`+${metrics.yearGrowth}%`} />
        </div>
      </div>
      <div className="flex gap-3">
        <button className="px-4 py-2 text-gray-700 border rounded-lg">
          Add to Watchlist
        </button>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">
          Generate Report
        </button>
      </div>
    </div>
  );
};

const MetricItem = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <p className="text-sm text-gray-500">{label}</p>
    <p className="font-semibold">{value}</p>
  </div>
);
