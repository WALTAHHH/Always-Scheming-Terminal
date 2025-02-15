import { formatCurrency, formatPercentage } from '@/lib/utils/formatters';

interface KeyMetricsProps {
  marketCap: number;
  revenue: number;
  operatingMargin: number;
}

export const KeyMetrics = ({ marketCap, revenue, operatingMargin }: KeyMetricsProps) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-gray-600">Market Cap</span>
        <span className="font-semibold">{formatCurrency(marketCap)}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-600">Revenue (TTM)</span>
        <span className="font-semibold">{formatCurrency(revenue)}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-600">Operating Margin</span>
        <span className="font-semibold">{formatPercentage(operatingMargin)}</span>
      </div>
    </div>
  );
}; 