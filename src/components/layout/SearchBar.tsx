export const SearchBar = () => {
  return (
    <div className="relative flex-1 max-w-2xl">
      <input
        type="text"
        placeholder="Search companies, games, trends..."
        className="w-full px-4 py-2 pl-10 rounded-lg bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <svg 
        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
        /* Add search icon */
      />
    </div>
  );
};
