"use client";

import { useState, useMemo } from "react";
import type { FeedItem } from "@/lib/database.types";
import type { FilterState } from "./FilterBar";
import { FilterBar, EMPTY_FILTERS } from "./FilterBar";
import { FeedRow } from "./FeedRow";

interface FeedProps {
  items: FeedItem[];
  sources: { name: string }[];
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
 * Group items by date label (Today, Yesterday, or formatted date).
 */
function groupByDate(items: FeedItem[]): { label: string; items: FeedItem[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Map<string, FeedItem[]> = new Map();

  for (const item of items) {
    const pubDate = item.published_at ? new Date(item.published_at) : null;
    let label: string;

    if (!pubDate) {
      label = "Unknown Date";
    } else {
      const itemDate = new Date(pubDate.getFullYear(), pubDate.getMonth(), pubDate.getDate());

      if (itemDate.getTime() === today.getTime()) {
        label = "Today";
      } else if (itemDate.getTime() === yesterday.getTime()) {
        label = "Yesterday";
      } else {
        // Check if same year
        if (itemDate.getFullYear() === now.getFullYear()) {
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
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(item);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function DateGroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="sticky top-[93px] z-30 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border px-3 py-2 flex items-center justify-between">
      <span className="text-ast-accent text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      <span className="text-ast-muted text-[10px]">
        {count} {count === 1 ? "item" : "items"}
      </span>
    </div>
  );
}

export function Feed({ items, sources }: FeedProps) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const tagCounts = useMemo(() => computeTagCounts(items), [items]);

  const filtered = useMemo(
    () => items.filter((item) => matchesFilter(item, filters)),
    [items, filters]
  );

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const hasActiveFilters =
    filters.sources.length > 0 ||
    filters.categories.length > 0 ||
    filters.platforms.length > 0 ||
    filters.themes.length > 0 ||
    filters.companies.length > 0 ||
    filters.search.length > 0;

  return (
    <>
      <FilterBar sources={sources} tagCounts={tagCounts} onFilterChange={setFilters} />
      <div className="max-w-5xl mx-auto px-4 py-2">
        {hasActiveFilters && (
          <div className="text-ast-muted text-xs mb-2 px-3">
            Showing {filtered.length} of {items.length} items
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <DateGroupHeader label={group.label} count={group.items.length} />
            <div className="divide-y divide-ast-border">
              {group.items.map((item) => (
                <FeedRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-ast-muted">
            No items match your filters.
          </div>
        )}
      </div>
    </>
  );
}
