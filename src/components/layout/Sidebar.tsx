import Link from 'next/link';
import { HomeIcon, BuildingOfficeIcon, PlayIcon, ChartBarIcon } from '@heroicons/react/24/outline';

export const Sidebar = () => {
  return (
    <div className="w-16 bg-gray-900 h-screen flex flex-col items-center py-4">
      <div className="text-white font-bold mb-8">GI</div>
      <nav className="flex flex-col gap-6">
        <Link href="/" className="text-gray-400 hover:text-white">
          <HomeIcon className="w-6 h-6" />
        </Link>
        <Link href="/companies" className="text-gray-400 hover:text-white">
          <BuildingOfficeIcon className="w-6 h-6" />
        </Link>
        <Link href="/games" className="text-gray-400 hover:text-white">
          <PlayIcon className="w-6 h-6" />
        </Link>
        <Link href="/insights" className="text-gray-400 hover:text-white">
          <ChartBarIcon className="w-6 h-6" />
        </Link>
      </nav>
    </div>
  );
} 