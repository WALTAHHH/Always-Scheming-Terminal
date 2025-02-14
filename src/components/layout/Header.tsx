import { SearchBar } from '@/components/layout/SearchBar';
import { BellIcon, FunnelIcon } from '@heroicons/react/24/outline';

export const Header = () => {
  return (
    <header className="h-16 border-b border-gray-200 px-4 flex items-center justify-between bg-white">
      <SearchBar />
      <div className="flex items-center gap-4">
        <button className="p-2 text-gray-600 hover:text-gray-900">
          <BellIcon className="w-5 h-5" />
        </button>
        <button className="p-2 text-gray-600 hover:text-gray-900">
          <FunnelIcon className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gray-200" />
      </div>
    </header>
  );
}