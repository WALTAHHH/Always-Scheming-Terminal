import { PlayIcon, UsersIcon, ChartBarIcon } from '@heroicons/react/24/outline';

interface MetricItemProps {
  label: string;
  value: string | number;
  icon: 'game' | 'users' | 'trend';
  trend?: 'up' | 'down';
}

export const MetricItem = ({ label, value, icon, trend }: MetricItemProps) => {
  const getIcon = () => {
    switch (icon) {
      case 'game':
        return <PlayIcon className="w-5 h-5 text-blue-500" />;
      case 'users':
        return <UsersIcon className="w-5 h-5 text-purple-500" />;
      case 'trend':
        return <ChartBarIcon className="w-5 h-5 text-green-500" />;
    }
  };

  return (
    <div className="flex items-center gap-3">
      {getIcon()}
      <div>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-lg font-semibold">
          {value}
          {trend && (
            <span className={`ml-1 text-sm ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
              {trend === 'up' ? '↑' : '↓'}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}; 