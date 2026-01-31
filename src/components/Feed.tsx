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

function matchesFilter(item: FeedItem, filters: FilterState): boolean {
  const tags = (item.tags as Record<string, string[]>) || {};
  const checks: boolean[] = [];

  // Source filter
  if (filters.sources.length > 0) {
    checks.push(
      filters.sources.includes(item.sources?.name || "")
    );
  }

  // Category filter
  if (filters.categories.length > 0) {
    const itemCats = tags.category || [];
    checks.push(
      filters.categories.some((c) => itemCats.includes(c))
    );
  }

  // Platform filter
  if (filters.platforms.length > 0) {
    const itemPlats = tags.platform || [];
    checks.push(
      filters.platforms.some((p) => itemPlats.includes(p))
    );
  }

  // Theme filter
  if (filters.themes.length > 0) {
    const itemThemes = tags.theme || [];
    checks.push(
      filters.themes.some((t) => itemThemes.includes(t))
    );
  }

  // Company filter
  if (filters.companies.length > 0) {
    const itemCompanies = tags.company || [];
    checks.push(
      filters.companies.some((c) => itemCompanies.includes(c))
    );
  }

  // Text search
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

export function Feed({ items, sources }: FeedProps) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const filtered = useMemo(
    () => items.filter((item) => matchesFilter(item, filters)),
    [items, filters]
  );

  const hasActiveFilters =
    filters.sources.length > 0 ||
    filters.categories.length > 0 ||
    filters.platforms.length > 0 ||
    filters.themes.length > 0 ||
    filters.companies.length > 0 ||
    filters.search.length > 0;

  return (
    <>
      <FilterBar sources={sources} onFilterChange={setFilters} />
      <div className="max-w-5xl mx-auto px-4 py-4">
        {hasActiveFilters && (
          <div className="text-ast-muted text-xs mb-3">
            Showing {filtered.length} of {items.length} items
          </div>
        )}
        <div className="divide-y divide-ast-border">
          {filtered.map((item) => (
            <FeedRow key={item.id} item={item} />
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-ast-muted">
            No items match your filters.
          </div>
        )}
      </div>
    </>
  );
}
