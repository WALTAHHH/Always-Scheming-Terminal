"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { ALL_CATEGORIES } from "@/lib/tagger";

interface TagOption {
  value: string;
  count: number;
}

interface FilterBarProps {
  sources: { name: string }[];
  tagCounts: Record<string, Record<string, number>>;
  onFilterChange: (filters: FilterState) => void;
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

function FilterDropdown({
  label,
  options,
  selected,
  isOpen,
  onToggleOpen,
  onToggleValue,
}: {
  label: string;
  options: TagOption[];
  selected: string[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggleValue: (value: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position when dropdown opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [isOpen]);

  if (options.length === 0) return null;

  const dropdownMenu = (
    <div 
      className="fixed bg-ast-surface border border-ast-border rounded-lg shadow-xl min-w-[180px] max-h-[300px] overflow-y-auto"
      style={{ top: position.top, left: position.left, zIndex: 99999 }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onToggleValue(opt.value)}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-ast-bg/50 flex items-center justify-between transition-colors ${
            selected.includes(opt.value) ? "text-ast-accent" : "text-ast-text"
          }`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
                selected.includes(opt.value)
                  ? "border-ast-accent bg-ast-accent/20"
                  : "border-ast-border"
              }`}
            >
              {selected.includes(opt.value) && (
                <span className="text-ast-accent text-[8px]">✓</span>
              )}
            </span>
            {opt.value}
          </span>
          <span className="text-ast-muted text-[10px]">{opt.count}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={onToggleOpen}
        className={`px-3 py-1.5 text-xs rounded border transition-colors ${
          selected.length > 0
            ? "border-ast-accent text-ast-accent bg-ast-accent/10"
            : "border-ast-border text-ast-muted hover:border-ast-muted"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="ml-1.5 px-1.5 py-0.5 bg-ast-accent/20 rounded text-[10px]">
            {selected.length}
          </span>
        )}
        <span className="ml-1">▾</span>
      </button>

      {isOpen && mounted && createPortal(dropdownMenu, document.body)}
    </div>
  );
}

// ── Mobile filter list (inline, no dropdown positioning issues) ────

function MobileFilterList({
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
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded border transition-colors ${
          selected.length > 0
            ? "border-ast-accent text-ast-accent bg-ast-accent/10"
            : "border-ast-border text-ast-muted"
        }`}
      >
        <span>
          {label}
          {selected.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-ast-accent/20 rounded text-[10px]">
              {selected.length}
            </span>
          )}
        </span>
        <span>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-1 border border-ast-border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onToggleValue(opt.value)}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                selected.includes(opt.value)
                  ? "text-ast-accent bg-ast-accent/5"
                  : "text-ast-text"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
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

export function FilterBar({ sources, tagCounts, onFilterChange }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Listen for keyboard shortcut events from KeyboardNav
  useEffect(() => {
    function handleShortcut(e: Event) {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      switch (detail.key) {
        case "source":
          setOpenDropdown((prev) => (prev === "source" ? null : "source"));
          break;
        case "company":
          setOpenDropdown((prev) => (prev === "company" ? null : "company"));
          break;
        case "search": {
          setOpenDropdown(null);
          const search = barRef.current?.querySelector<HTMLInputElement>(
            'input[placeholder="Search..."]'
          );
          search?.focus();
          break;
        }
        case "close":
          setOpenDropdown(null);
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

  // Build tag options from actual item counts
  const toOptions = (dim: string): TagOption[] => {
    const counts = tagCounts[dim] || {};
    return Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  };

  // Category options: always show all categories, even with 0 count
  const categoryOptions: TagOption[] = ALL_CATEGORIES.map((cat) => ({
    value: cat,
    count: tagCounts.category?.[cat] || 0,
  })).sort((a, b) => b.count - a.count);

  const sourceOptions: TagOption[] = sources.map((s) => ({
    value: s.name,
    count: tagCounts._sources?.[s.name] || 0,
  })).sort((a, b) => b.count - a.count);

  const companyOptions = toOptions("company");

  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    onFilterChange(EMPTY_FILTERS);
    setOpenDropdown(null);
  };

  return (
    <div className="h-11 border-b border-ast-border bg-ast-bg/95 backdrop-blur-sm sticky top-0 z-40 flex items-center">
      {/* ── Desktop filter bar ── */}
      <div className="hidden sm:flex max-w-5xl mx-auto px-4 items-center gap-2 w-full overflow-x-auto" ref={barRef}>
        <FilterDropdown
          label="Source"
          options={sourceOptions}
          selected={filters.sources}
          isOpen={openDropdown === "source"}
          onToggleOpen={() => setOpenDropdown(openDropdown === "source" ? null : "source")}
          onToggleValue={(v) =>
            updateFilters({ sources: toggleInArray(filters.sources, v) })
          }
        />
        <FilterDropdown
          label="Category"
          options={categoryOptions}
          selected={filters.categories}
          isOpen={openDropdown === "category"}
          onToggleOpen={() => setOpenDropdown(openDropdown === "category" ? null : "category")}
          onToggleValue={(v) =>
            updateFilters({ categories: toggleInArray(filters.categories, v) })
          }
        />
        <FilterDropdown
          label="Platform"
          options={toOptions("platform")}
          selected={filters.platforms}
          isOpen={openDropdown === "platform"}
          onToggleOpen={() => setOpenDropdown(openDropdown === "platform" ? null : "platform")}
          onToggleValue={(v) =>
            updateFilters({ platforms: toggleInArray(filters.platforms, v) })
          }
        />
        <FilterDropdown
          label="Theme"
          options={toOptions("theme")}
          selected={filters.themes}
          isOpen={openDropdown === "theme"}
          onToggleOpen={() => setOpenDropdown(openDropdown === "theme" ? null : "theme")}
          onToggleValue={(v) =>
            updateFilters({ themes: toggleInArray(filters.themes, v) })
          }
        />
        {companyOptions.length > 0 && (
          <FilterDropdown
            label="Company"
            options={companyOptions}
            selected={filters.companies}
            isOpen={openDropdown === "company"}
            onToggleOpen={() => setOpenDropdown(openDropdown === "company" ? null : "company")}
            onToggleValue={(v) =>
              updateFilters({ companies: toggleInArray(filters.companies, v) })
            }
          />
        )}

        {/* AND/OR toggle */}
        <button
          onClick={() =>
            updateFilters({ mode: filters.mode === "and" ? "or" : "and" })
          }
          className={`px-2 py-1.5 text-[10px] rounded border font-semibold transition-colors ${
            filters.mode === "and"
              ? "border-ast-accent text-ast-accent"
              : "border-ast-border text-ast-muted"
          }`}
        >
          {filters.mode.toUpperCase()}
        </button>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            className="bg-ast-surface border border-ast-border rounded px-3 py-1.5 text-xs text-ast-text placeholder:text-ast-muted w-48 focus:border-ast-accent focus:outline-none transition-colors"
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

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="px-3 py-1.5 text-xs rounded border border-ast-pink/40 text-ast-pink hover:bg-ast-pink/10 transition-colors"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Mobile filter bar ── */}
      <div className="sm:hidden">
        {/* Top row: search + filter toggle */}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="relative flex-1">
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
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors flex-shrink-0 ${
              hasActiveFilters
                ? "border-ast-accent text-ast-accent bg-ast-accent/10"
                : "border-ast-border text-ast-muted"
            }`}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-ast-accent/20 rounded text-[10px]">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Slide-down filter panel */}
        {mobileOpen && (
          <div className="px-3 pb-3 space-y-2 border-t border-ast-border/50 pt-2">
            <MobileFilterList
              label="Source"
              options={sourceOptions}
              selected={filters.sources}
              onToggleValue={(v) =>
                updateFilters({ sources: toggleInArray(filters.sources, v) })
              }
            />
            <MobileFilterList
              label="Category"
              options={categoryOptions}
              selected={filters.categories}
              onToggleValue={(v) =>
                updateFilters({ categories: toggleInArray(filters.categories, v) })
              }
            />
            <MobileFilterList
              label="Platform"
              options={toOptions("platform")}
              selected={filters.platforms}
              onToggleValue={(v) =>
                updateFilters({ platforms: toggleInArray(filters.platforms, v) })
              }
            />
            <MobileFilterList
              label="Theme"
              options={toOptions("theme")}
              selected={filters.themes}
              onToggleValue={(v) =>
                updateFilters({ themes: toggleInArray(filters.themes, v) })
              }
            />
            {companyOptions.length > 0 && (
              <MobileFilterList
                label="Company"
                options={companyOptions}
                selected={filters.companies}
                onToggleValue={(v) =>
                  updateFilters({ companies: toggleInArray(filters.companies, v) })
                }
              />
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() =>
                  updateFilters({ mode: filters.mode === "and" ? "or" : "and" })
                }
                className={`px-2 py-1.5 text-[10px] rounded border font-semibold transition-colors ${
                  filters.mode === "and"
                    ? "border-ast-accent text-ast-accent"
                    : "border-ast-border text-ast-muted"
                }`}
              >
                {filters.mode.toUpperCase()}
              </button>

              {hasActiveFilters && (
                <button
                  onClick={clearAll}
                  className="px-3 py-1.5 text-xs rounded border border-ast-pink/40 text-ast-pink hover:bg-ast-pink/10 transition-colors"
                >
                  ✕ Clear All
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
