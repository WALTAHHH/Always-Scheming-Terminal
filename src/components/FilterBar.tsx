"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { ALL_CATEGORIES, ALL_PLATFORMS, ALL_THEMES } from "@/lib/tagger";

interface TagOption {
  value: string;
  count: number;
}

export interface FilterState {
  sources: string[];
  categories: string[];
  platforms: string[];
  themes: string[];
  companies: string[];
  search: string;
  mode: "and" | "or";
}

export const EMPTY_FILTERS: FilterState = {
  sources: [],
  categories: [],
  platforms: [],
  themes: [],
  companies: [],
  search: "",
  mode: "or",
};

interface FilterBarProps {
  sources: { name: string }[];
  tagCounts: Record<string, Record<string, number>>;
  onFilterChange: (filters: FilterState) => void;
}

// ── Inline filter section inside the drawer ────────────────────────────────

function FilterSection({
  label,
  options,
  selected,
  onToggleValue,
}: {
  label: string;
  options: TagOption[];
  selected: string[];
  onToggleValue: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (options.length === 0) return null;

  return (
    <div className="border-b border-ast-border/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-ast-muted hover:text-ast-text transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="uppercase tracking-widest text-[10px] font-semibold">{label}</span>
          {selected.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-ast-accent/20 text-ast-accent text-[10px] font-medium">
              {selected.length}
            </span>
          )}
        </span>
        <span className="text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="pb-2 max-h-[240px] overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onToggleValue(opt.value)}
              className={`w-full text-left px-4 py-1.5 text-xs flex items-center justify-between transition-colors hover:bg-ast-surface/50 ${
                selected.includes(opt.value) ? "text-ast-accent" : "text-ast-text"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center ${
                    selected.includes(opt.value)
                      ? "border-ast-accent bg-ast-accent/20"
                      : "border-ast-border"
                  }`}
                >
                  {selected.includes(opt.value) && (
                    <span className="text-ast-accent text-[8px]">✓</span>
                  )}
                </span>
                <span className="truncate">{opt.value}</span>
              </span>
              <span className="text-ast-muted text-[10px] flex-shrink-0 ml-2">{opt.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main FilterBar ─────────────────────────────────────────────────────────

export function FilterBar({ sources, tagCounts, onFilterChange }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for keyboard shortcut events from KeyboardNav
  useEffect(() => {
    function handleShortcut(e: Event) {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      switch (detail.key) {
        case "source":
        case "company":
          setDrawerOpen(true);
          break;
        case "close":
          setDrawerOpen(false);
          break;
      }
    }
    window.addEventListener("ast-shortcut", handleShortcut);
    return () => window.removeEventListener("ast-shortcut", handleShortcut);
  }, []);

  const updateFilters = useCallback(
    (update: Partial<FilterState>) => {
      const next = { ...filters, ...update };
      setFilters(next);
      onFilterChange(next);
    },
    [filters, onFilterChange]
  );

  const toggleInArray = (arr: string[], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const activeFilterCount =
    filters.sources.length +
    filters.categories.length +
    filters.platforms.length +
    filters.themes.length +
    filters.companies.length +
    (filters.search.length > 0 ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0;

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    onFilterChange(EMPTY_FILTERS);
  };

  // Build options
  const toOptions = (dim: string): TagOption[] =>
    Object.entries(tagCounts[dim] || {})
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

  const categoryOptions: TagOption[] = ALL_CATEGORIES.map((cat) => ({
    value: cat,
    count: tagCounts.category?.[cat] || 0,
  })).sort((a, b) => b.count - a.count);

  const platformOptions: TagOption[] = ALL_PLATFORMS.map((plat) => ({
    value: plat,
    count: tagCounts.platform?.[plat] || 0,
  })).sort((a, b) => b.count - a.count);

  const themeOptions: TagOption[] = ALL_THEMES.map((theme) => ({
    value: theme,
    count: tagCounts.theme?.[theme] || 0,
  })).sort((a, b) => b.count - a.count);

  const sourceOptions: TagOption[] = sources
    .map((s) => ({ value: s.name, count: tagCounts._sources?.[s.name] || 0 }))
    .sort((a, b) => b.count - a.count);

  const companyOptions = toOptions("company");


  return (
    <>
      {/* Drawer + tab portal — rendered at body level to escape overflow/stacking contexts */}
      {mounted && createPortal(
        <>
          {/* Backdrop */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-[9990] bg-black/40 backdrop-blur-[2px]"
              onClick={() => setDrawerOpen(false)}
            />
          )}

          {/* Drawer + attached tab, slide in together from the left */}
          <div
            className={`fixed top-0 left-0 h-full z-[9995] flex transition-transform duration-200 ease-in-out ${
              drawerOpen ? "translate-x-0" : "-translate-x-72"
            }`}
          >
            {/* Drawer panel */}
            <div className="w-72 h-full bg-ast-bg border-r border-ast-border flex flex-col shadow-2xl">
              {/* Drawer header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-ast-border">
                <span className="text-xs font-semibold tracking-widest uppercase text-ast-muted">Filters</span>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <button
                      onClick={clearAll}
                      className="text-[10px] text-ast-pink hover:text-ast-pink/80 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="text-ast-muted hover:text-ast-text transition-colors text-base leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="px-4 py-3 border-b border-ast-border/50">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={filters.search}
                    onChange={(e) => updateFilters({ search: e.target.value })}
                    className="w-full bg-ast-surface border border-ast-border rounded px-3 py-1.5 text-xs text-ast-text placeholder:text-ast-muted focus:border-ast-accent focus:outline-none transition-colors"
                  />
                  {filters.search && (
                    <button
                      onClick={() => updateFilters({ search: "" })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-ast-muted hover:text-ast-text text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* AND/OR toggle */}
              <div className="px-4 py-2 border-b border-ast-border/50 flex items-center gap-2">
                <span className="text-[10px] text-ast-muted uppercase tracking-widest">Match</span>
                <button
                  onClick={() => updateFilters({ mode: filters.mode === "and" ? "or" : "and" })}
                  className={`px-2 py-1 text-[10px] rounded border font-semibold transition-colors ${
                    filters.mode === "and"
                      ? "border-ast-accent text-ast-accent"
                      : "border-ast-border text-ast-muted"
                  }`}
                >
                  {filters.mode === "and" ? "ALL (AND)" : "ANY (OR)"}
                </button>
              </div>

              {/* Filter sections — scrollable */}
              <div className="flex-1 overflow-y-auto">
                <FilterSection
                  label="Source"
                  options={sourceOptions}
                  selected={filters.sources}
                  onToggleValue={(v) => updateFilters({ sources: toggleInArray(filters.sources, v) })}
                />
                <FilterSection
                  label="Category"
                  options={categoryOptions}
                  selected={filters.categories}
                  onToggleValue={(v) => updateFilters({ categories: toggleInArray(filters.categories, v) })}
                />
                <FilterSection
                  label="Platform"
                  options={platformOptions}
                  selected={filters.platforms}
                  onToggleValue={(v) => updateFilters({ platforms: toggleInArray(filters.platforms, v) })}
                />
                <FilterSection
                  label="Theme"
                  options={themeOptions}
                  selected={filters.themes}
                  onToggleValue={(v) => updateFilters({ themes: toggleInArray(filters.themes, v) })}
                />
                {companyOptions.length > 0 && (
                  <FilterSection
                    label="Company"
                    options={companyOptions}
                    selected={filters.companies}
                    onToggleValue={(v) => updateFilters({ companies: toggleInArray(filters.companies, v) })}
                  />
                )}
              </div>
            </div>

            {/* Pull tab — attached to right edge of drawer, always visible */}
            <button
              onClick={() => setDrawerOpen((o) => !o)}
              className={`absolute top-1/2 -translate-y-1/2 left-72 flex flex-col items-center justify-center gap-1.5
                w-6 py-4 rounded-r border-y border-r border-ast-border bg-ast-surface shadow-md
                transition-colors hover:bg-ast-surface/80
                ${hasActiveFilters ? "border-l-2 border-l-ast-accent" : "border-l border-l-ast-border"}`}
              title="Toggle filters"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={hasActiveFilters ? "text-ast-accent" : "text-ast-muted"}>
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
              </svg>
              <span
                className={`text-[9px] font-semibold tracking-widest uppercase [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180
                  ${hasActiveFilters ? "text-ast-accent" : "text-ast-muted"}`}
              >
                {activeFilterCount > 0 ? `${activeFilterCount}` : "filter"}
              </span>
            </button>
          </div>

          {/* Tab visible when drawer is CLOSED — fixed to left edge */}
          {!drawerOpen && (
            <button
              onClick={() => setDrawerOpen(true)}
              className={`fixed top-1/2 -translate-y-1/2 left-0 z-[9985] flex flex-col items-center justify-center gap-1.5
                w-6 py-4 rounded-r border-y border-r border-ast-border bg-ast-surface shadow-md
                transition-colors hover:bg-ast-surface/80
                ${hasActiveFilters ? "border-l-2 border-l-ast-accent" : "border-l border-l-ast-border"}`}
              title="Open filters"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={hasActiveFilters ? "text-ast-accent" : "text-ast-muted"}>
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
              </svg>
              <span
                className={`text-[9px] font-semibold tracking-widest uppercase [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180
                  ${hasActiveFilters ? "text-ast-accent" : "text-ast-muted"}`}
              >
                {activeFilterCount > 0 ? `${activeFilterCount}` : "filter"}
              </span>
            </button>
          )}
        </>,
        document.body
      )}
    </>
  );
}
