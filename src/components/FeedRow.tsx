"use client";

import { useState } from "react";
import type { FeedItem } from "@/lib/database.types";
import { TimeAgo } from "./TimeAgo";

function truncate(text: string | null, maxLen: number): string {
  if (!text) return "";
  const clean = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trimEnd() + "…";
}

function cleanContent(text: string | null): string {
  if (!text) return "";
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

const TAG_DIMENSION_COLORS: Record<string, string> = {
  company: "border-l-ast-gold text-ast-gold",
  platform: "border-l-ast-accent text-ast-accent",
  theme: "border-l-ast-pink text-ast-pink",
  category: "border-l-ast-mint text-ast-mint",
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
  newsletter: "border-l-ast-mint",
  news: "border-l-ast-accent",
  analysis: "border-l-ast-pink",
  podcast: "border-l-ast-gold",
};

interface FeedRowProps {
  item: FeedItem;
}

export function FeedRow({ item }: FeedRowProps) {
  const [expanded, setExpanded] = useState(false);
  const sourceType = item.sources?.source_type || "news";
  const borderColor = SOURCE_COLORS[sourceType] || "border-l-ast-accent";
  const fullContent = cleanContent(item.content);
  const hasMoreContent = fullContent.length > 180;

  return (
    <div className={`border-l-2 ${borderColor}`}>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        data-feed-item
        className="block py-3 px-3 hover:bg-ast-surface/50 transition-colors group"
      >
        <div className="flex items-start gap-3">
          {/* Timestamp — self-updating */}
          <div className="flex-shrink-0 w-[40px] pt-0.5 text-right">
            <TimeAgo date={item.published_at} className="text-ast-muted text-xs" />
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
            {item.content && !expanded && (
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

      {/* Inline expand toggle */}
      {hasMoreContent && (
        <div className="px-3 pb-2 ml-[52px]">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-[10px] text-ast-muted hover:text-ast-accent transition-colors"
          >
            {expanded ? "▾ Collapse" : "▸ Preview"}
          </button>
        </div>
      )}

      {/* Expanded content */}
      {expanded && fullContent && (
        <div className="px-3 pb-3 ml-[52px]">
          <div className="text-xs text-ast-text/80 leading-relaxed bg-ast-surface/30 rounded px-3 py-2 border border-ast-border/30">
            {fullContent}
          </div>
        </div>
      )}
    </div>
  );
}
