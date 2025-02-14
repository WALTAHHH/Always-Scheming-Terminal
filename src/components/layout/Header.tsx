import { SearchBar } from './SearchBar';

export const Header = () => {
  return (
    <header className="h-16 border-b border-gray-200 px-4 flex items-center justify-between">
      <SearchBar />
      <div className="flex items-center gap-4">
        <button className="p-2 text-gray-600 hover:text-gray-900">
          <svg className="w-5 h-5" /* Add notifications icon */ />
        </button>
        <button className="p-2 text-gray-600 hover:text-gray-900">
          <svg className="w-5 h-5" /* Add filters icon */ />
        </button>
        <div className="w-8 h-8 rounded-full bg-gray-200" /* User avatar */ />
      </div>
    </header>
  );
};
