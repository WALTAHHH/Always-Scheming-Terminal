interface KeyMetricsProps {
  marketCap: string;
  revenue: string;
  operatingMargin: string;
}

export const KeyMetrics = ({ marketCap, revenue, operatingMargin }: KeyMetricsProps) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-gray-600">Market Cap</span>
        <span className="font-semibold">{marketCap}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-600">Revenue (TTM)</span>
        <span className="font-semibold">{revenue}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-600">Operating Margin</span>
        <span className="font-semibold">{operatingMargin}</span>
      </div>
    </div>
  );
}; 