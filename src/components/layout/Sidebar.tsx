import Link from 'next/link';

export const Sidebar = () => {
  return (
    <div className="w-16 bg-gray-900 h-screen flex flex-col items-center py-4">
      <div className="text-white font-bold mb-8">GI</div>
      <nav className="flex flex-col gap-6">
        <Link href="/" className="text-gray-400 hover:text-white">
          <svg className="w-6 h-6" /* Add dashboard icon */ />
        </Link>
        <Link href="/companies" className="text-gray-400 hover:text-white">
          <svg className="w-6 h-6" /* Add companies icon */ />
        </Link>
        <Link href="/games" className="text-gray-400 hover:text-white">
          <svg className="w-6 h-6" /* Add games icon */ />
        </Link>
        <Link href="/insights" className="text-gray-400 hover:text-white">
          <svg className="w-6 h-6" /* Add insights icon */ />
        </Link>
      </nav>
    </div>
  );
};
