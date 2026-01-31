"use client";

import type { FeedItem } from "@/lib/database.types";

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "--:--";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  // Within the last hour: "12m ago"
  if (diffMins < 60) return `${diffMins}m`;
  // Within the last 24h: "3h ago"
  if (diffHours < 24) return `${diffHours}h`;
  // Otherwise just show the time
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function truncate(text: string | null, maxLen: number): string {
  if (!text) return "";
  const clean = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trimEnd() + "…";
}

const TAG_DIMENSION_COLORS: Record<string, string> = {
  company: "border-l-[#f2cb05] text-[#f2cb05]",
  platform: "border-l-[#77c4d9] text-[#77c4d9]",
  theme: "border-l-[#dd72dd] text-[#dd72dd]",
  category: "border-l-[#6decb9] text-[#6decb9]",
};

function TagChips({ tags }: { tags: Record<string, string[]> | null }) {
  if (!tags) return null;

  const allTags: { dimension: string; value: string }[] = [];
  for (const [dim, values] of Object.entries(tags)) {
    if (Array.isArray(values)) {
      for (const v of values) {
        allTags.push({ dimension: dim, value: v });
      }
    }
  }

  if (allTags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {allTags.map((tag, i) => {
        const colors = TAG_DIMENSION_COLORS[tag.dimension] || "border-l-ast-muted text-ast-muted";
        return (
          <span
            key={`${tag.dimension}-${tag.value}-${i}`}
            className={`px-1.5 py-0.5 text-[10px] bg-ast-tag border-l-2 rounded-sm ${colors}`}
          >
            {tag.value}
          </span>
        );
      })}
    </div>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  newsletter: "border-l-emerald-500",
  news: "border-l-blue-500",
  analysis: "border-l-purple-500",
  podcast: "border-l-orange-500",
};

interface FeedRowProps {
  item: FeedItem;
}

export function FeedRow({ item }: FeedRowProps) {
  const sourceType = item.sources?.source_type || "news";
  const borderColor = SOURCE_COLORS[sourceType] || "border-l-ast-accent";

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block py-3 px-3 border-l-2 ${borderColor} hover:bg-ast-surface/50 transition-colors group`}
    >
      <div className="flex items-start gap-3">
        {/* Timestamp */}
        <div className="flex-shrink-0 w-[40px] text-ast-muted text-xs pt-0.5 text-right">
          {formatTime(item.published_at)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-ast-accent text-xs font-medium">
              {item.sources?.name || "Unknown"}
            </span>
            {item.author && (
              <span className="text-ast-muted text-xs">
                · {item.author}
              </span>
            )}
          </div>
          <h3 className="text-ast-text text-sm font-medium leading-snug group-hover:text-ast-accent transition-colors">
            {item.title}
          </h3>
          {item.content && (
            <p className="text-ast-muted text-xs mt-1 leading-relaxed">
              {truncate(item.content, 180)}
            </p>
          )}
          <TagChips tags={item.tags as Record<string, string[]> | null} />
        </div>

        {/* External link indicator */}
        <div className="flex-shrink-0 text-ast-muted opacity-0 group-hover:opacity-100 transition-opacity pt-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>
      </div>
    </a>
  );
}
