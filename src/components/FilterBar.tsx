"use client";

import { useState, useEffect, useCallback } from "react";

interface TagOption {
  value: string;
  count: number;
}

interface FilterBarProps {
  sources: { name: string }[];
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
  onToggle,
}: {
  label: string;
  options: TagOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (options.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
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

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full mt-1 left-0 z-50 bg-ast-surface border border-ast-border rounded-lg shadow-xl min-w-[180px] max-h-[300px] overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onToggle(opt.value)}
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
        </>
      )}
    </div>
  );
}

export function FilterBar({ sources, onFilterChange }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [tags, setTags] = useState<Record<string, TagOption[]>>({});

  // Fetch available tags
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => setTags(data.tags || {}))
      .catch(console.error);
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

  const hasActiveFilters =
    filters.sources.length > 0 ||
    filters.categories.length > 0 ||
    filters.platforms.length > 0 ||
    filters.themes.length > 0 ||
    filters.companies.length > 0 ||
    filters.search.length > 0;

  const sourceOptions: TagOption[] = sources.map((s) => ({
    value: s.name,
    count: 0,
  }));

  return (
    <div className="border-b border-ast-border bg-ast-bg/95 backdrop-blur-sm sticky top-[53px] z-40">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
        {/* Filter dropdowns */}
        <FilterDropdown
          label="Source"
          options={sourceOptions}
          selected={filters.sources}
          onToggle={(v) =>
            updateFilters({ sources: toggleInArray(filters.sources, v) })
          }
        />
        <FilterDropdown
          label="Category"
          options={tags.category || []}
          selected={filters.categories}
          onToggle={(v) =>
            updateFilters({ categories: toggleInArray(filters.categories, v) })
          }
        />
        <FilterDropdown
          label="Platform"
          options={tags.platform || []}
          selected={filters.platforms}
          onToggle={(v) =>
            updateFilters({ platforms: toggleInArray(filters.platforms, v) })
          }
        />
        <FilterDropdown
          label="Theme"
          options={tags.theme || []}
          selected={filters.themes}
          onToggle={(v) =>
            updateFilters({ themes: toggleInArray(filters.themes, v) })
          }
        />
        {(tags.company?.length ?? 0) > 0 && (
          <FilterDropdown
            label="Company"
            options={tags.company || []}
            selected={filters.companies}
            onToggle={(v) =>
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

        {/* Spacer */}
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
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              onFilterChange(EMPTY_FILTERS);
            }}
            className="text-ast-muted hover:text-ast-accent text-xs transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
