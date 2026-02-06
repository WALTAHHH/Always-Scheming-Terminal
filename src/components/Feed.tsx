"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { FeedItem } from "@/lib/database.types";
import type { FilterState } from "./FilterBar";
import { FilterBar, EMPTY_FILTERS } from "./FilterBar";
import { ClusterRow } from "./ClusterRow";
import { clusterItems, type StoryCluster } from "@/lib/cluster";
import { scoreCluster } from "@/lib/importance";

export type SortMode = "recent" | "importance";

interface FeedProps {
  items: FeedItem[];
  sources: { name: string }[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

/**
 * Compute tag counts from the actual loaded items.
 */
function computeTagCounts(items: FeedItem[]): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {
    _sources: {},
  };

  for (const item of items) {
    const sourceName = item.sources?.name;
    if (sourceName) {
      counts._sources[sourceName] = (counts._sources[sourceName] || 0) + 1;
    }

    const tags = (item.tags as Record<string, string[]>) || {};
    for (const [dim, values] of Object.entries(tags)) {
      if (!Array.isArray(values)) continue;
      if (!counts[dim]) counts[dim] = {};
      for (const v of values) {
        counts[dim][v] = (counts[dim][v] || 0) + 1;
      }
    }
  }

  return counts;
}

function matchesFilter(item: FeedItem, filters: FilterState): boolean {
  const tags = (item.tags as Record<string, string[]>) || {};
  const sourceName = item.sources?.name || "";

  const checks: boolean[] = [];

  for (const s of filters.sources) {
    checks.push(sourceName === s);
  }

  const itemCats = tags.category || [];
  for (const c of filters.categories) {
    checks.push(itemCats.includes(c));
  }

  const itemPlats = tags.platform || [];
  for (const p of filters.platforms) {
    checks.push(itemPlats.includes(p));
  }

  const itemThemes = tags.theme || [];
  for (const t of filters.themes) {
    checks.push(itemThemes.includes(t));
  }

  const itemCompanies = tags.company || [];
  for (const c of filters.companies) {
    checks.push(itemCompanies.includes(c));
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    checks.push(
      item.title.toLowerCase().includes(q) ||
        (item.content || "").toLowerCase().includes(q)
    );
  }

  if (checks.length === 0) return true;

  return filters.mode === "and"
    ? checks.every(Boolean)
    : checks.some(Boolean);
}

/**
 * Group clusters by date label.
 */
function groupByDate(
  clusters: StoryCluster[]
): { label: string; clusters: StoryCluster[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Map<string, StoryCluster[]> = new Map();

  for (const cluster of clusters) {
    const pubDate = cluster.lead.published_at
      ? new Date(cluster.lead.published_at)
      : null;
    let label: string;

    if (!pubDate) {
      label = "Unknown Date";
    } else {
      const itemDate = new Date(
        pubDate.getFullYear(),
        pubDate.getMonth(),
        pubDate.getDate()
      );

      if (itemDate.getTime() === today.getTime()) {
        label = "Today";
      } else if (itemDate.getTime() === yesterday.getTime()) {
        label = "Yesterday";
      } else if (itemDate.getFullYear() === now.getFullYear()) {
        label = pubDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
      } else {
        label = pubDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(cluster);
  }

  return Array.from(groups.entries()).map(([label, clusters]) => ({
    label,
    clusters,
  }));
}

function DateGroupHeader({
  label,
  storyCount,
  articleCount,
}: {
  label: string;
  storyCount: number;
  articleCount: number;
}) {
  return (
    <div className="sticky top-11 z-30 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border px-3 py-2 flex items-center justify-between">
      <span className="text-ast-accent text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      <span className="text-ast-muted text-[10px]">
        {storyCount} {storyCount === 1 ? "story" : "stories"}
        <span className="hidden sm:inline">
          {articleCount > storyCount && (
            <span> · {articleCount} articles</span>
          )}
        </span>
      </span>
    </div>
  );
}

export function Feed({ items, sources, hasMore, loadingMore, onLoadMore }: FeedProps) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sortMode, setSortMode] = useState<SortMode>("importance");
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: "400px" } // trigger 400px before reaching the bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore]);

  const tagCounts = useMemo(() => computeTagCounts(items), [items]);

  const filtered = useMemo(
    () => items.filter((item) => matchesFilter(item, filters)),
    [items, filters]
  );

  // Cluster filtered items and compute importance scores
  const clusters = useMemo(() => {
    const raw = clusterItems(filtered);
    return raw.map((c) => ({
      ...c,
      importanceScore: scoreCluster(c),
    }));
  }, [filtered]);

  // Group by date
  const groups = useMemo(() => groupByDate(clusters), [clusters]);

  // Sort within each date group
  const sortedGroups = useMemo(
    () =>
      groups.map((g) => ({
        ...g,
        clusters: [...g.clusters].sort((a, b) => {
          if (sortMode === "importance") {
            const diff = (b.importanceScore ?? 0) - (a.importanceScore ?? 0);
            if (diff !== 0) return diff;
            // Fall back to chronological for same importance
            const aTime = a.lead.published_at ? new Date(a.lead.published_at).getTime() : 0;
            const bTime = b.lead.published_at ? new Date(b.lead.published_at).getTime() : 0;
            return bTime - aTime;
          }
          // "recent" — chronological within date group (newest first)
          const aTime = a.lead.published_at ? new Date(a.lead.published_at).getTime() : 0;
          const bTime = b.lead.published_at ? new Date(b.lead.published_at).getTime() : 0;
          return bTime - aTime;
        }),
      })),
    [groups, sortMode]
  );

  const hasActiveFilters =
    filters.sources.length > 0 ||
    filters.categories.length > 0 ||
    filters.platforms.length > 0 ||
    filters.themes.length > 0 ||
    filters.companies.length > 0 ||
    filters.search.length > 0;

  const totalArticles = filtered.length;
  const totalStories = clusters.length;
  const multiSourceCount = clusters.filter((c) => c.isMultiSource).length;

  return (
    <>
      <FilterBar sources={sources} tagCounts={tagCounts} onFilterChange={setFilters} />
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2">
        {/* Stats bar */}
        <div className="text-ast-muted text-xs mb-2 px-1 sm:px-3 flex items-center gap-2 sm:gap-3">
          <span className="text-[10px] sm:text-xs">
            {totalArticles} articles → {totalStories} stories
          </span>
          {multiSourceCount > 0 && (
            <span className="text-ast-gold hidden sm:inline">
              {multiSourceCount} multi-source
            </span>
          )}
          <div className="flex-1" />
          {/* Sort toggle */}
          <div className="flex items-center border border-ast-border rounded overflow-hidden flex-shrink-0">
            <button
              onClick={() => setSortMode("importance")}
              className={`px-2 sm:px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-colors ${
                sortMode === "importance"
                  ? "bg-ast-gold/15 text-ast-gold"
                  : "text-ast-muted hover:text-ast-text"
              }`}
            >
              SIGNAL
            </button>
            <div className="w-px h-4 bg-ast-border" />
            <button
              onClick={() => setSortMode("recent")}
              className={`px-2 sm:px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-colors ${
                sortMode === "recent"
                  ? "bg-ast-accent/15 text-ast-accent"
                  : "text-ast-muted hover:text-ast-text"
              }`}
            >
              LATEST
            </button>
          </div>
        </div>

        {sortedGroups.map((group) => {
          const articleCount = group.clusters.reduce(
            (sum, c) => sum + 1 + c.related.length,
            0
          );
          return (
            <div key={group.label} className="mb-2">
              <DateGroupHeader
                label={group.label}
                storyCount={group.clusters.length}
                articleCount={articleCount}
              />
              <div className="divide-y divide-ast-border">
                {group.clusters.map((cluster) => (
                  <ClusterRow key={cluster.id} cluster={cluster} />
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-ast-muted">
            No items match your filters.
          </div>
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className="py-8 text-center">
            {loadingMore ? (
              <span className="text-ast-muted text-xs animate-pulse">Loading more articles...</span>
            ) : (
              <span className="text-ast-muted/50 text-xs">·</span>
            )}
          </div>
        )}

        {!hasMore && filtered.length > 0 && (
          <div className="py-8 text-center text-ast-muted/40 text-xs">
            End of feed
          </div>
        )}
      </div>
    </>
  );
}
