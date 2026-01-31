"use client";

interface NewItemsBannerProps {
  count: number;
  onClick: () => void;
}

export function NewItemsBanner({ count, onClick }: NewItemsBannerProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className="fixed top-[100px] left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-ast-accent/90 text-ast-bg text-xs font-semibold rounded-full shadow-lg hover:bg-ast-accent transition-all animate-bounce-in backdrop-blur-sm"
    >
      {count} new {count === 1 ? "item" : "items"} ↑
    </button>
  );
}
