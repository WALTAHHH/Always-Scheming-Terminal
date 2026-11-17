"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";

export type ThemeTag = { value: string; count: number };

export interface TagPickerProps {
  /** Current selection. May contain "legacy" values no longer in the catalogue. */
  selected: string[];
  /** Fired with the full next selection whenever it changes. */
  onChange: (next: string[]) => void;
}

const FETCH_URL = "/api/tags/themes";
const MAX_RESULTS = 50;
const BROWSE_PAGE = 300;

/**
 * Accessible "pick from existing tags only" combobox + browse-all panel.
 *
 * - The tag catalogue (GET /api/tags/themes, now DISTINCT + counts) is lazy
 *   loaded: only on first focus of the input or when the browse panel opens.
 * - Free text cannot be added: you can only select a tag that exists in the
 *   catalogue. Anything else shows "No matching tags".
 * - Values that are already saved but are no longer in the catalogue (retired
 *   tags) render as removable "legacy" chips instead of being dropped.
 */
export default function TagPicker({ selected, onChange }: TagPickerProps) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const optionId = useCallback(
    (index: number) => `${inputId}-option-${index}`,
    [inputId]
  );

  const [tags, setTags] = useState<ThemeTag[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadedRef = useRef(false);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseSort, setBrowseSort] = useState<"alpha" | "popular">("alpha");
  const [browseLimit, setBrowseLimit] = useState(BROWSE_PAGE);

  const ensureLoaded = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    setLoadError(false);
    fetch(FETCH_URL)
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status)))
      )
      .then((data) => {
        setTags(Array.isArray(data?.tags) ? (data.tags as ThemeTag[]) : []);
      })
      .catch(() => {
        setLoadError(true);
        loadedRef.current = false; // allow a retry on next focus
      })
      .finally(() => setLoading(false));
  }, []);

  const knownValues = useMemo(
    () => new Set((tags ?? []).map((tag) => tag.value)),
    [tags]
  );

  const available = useMemo(
    () => (tags ?? []).filter((tag) => !selected.includes(tag.value)),
    [tags, selected]
  );

  // Typeahead results: substring match (case-insensitive), prefix matches
  // ranked first, alphabetical within each group, capped for rendering.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? available.filter((tag) => tag.value.toLowerCase().includes(q))
      : available;
    const ranked = q
      ? [...base].sort((a, b) => {
          const aPrefix = a.value.toLowerCase().startsWith(q) ? 0 : 1;
          const bPrefix = b.value.toLowerCase().startsWith(q) ? 0 : 1;
          return aPrefix !== bPrefix
            ? aPrefix - bPrefix
            : a.value.localeCompare(b.value);
        })
      : base;
    return ranked.slice(0, MAX_RESULTS);
  }, [available, query]);

  // Browse panel list: search + sort + "show more" pagination.
  const browseList = useMemo(() => {
    const q = browseQuery.trim().toLowerCase();
    const base = (tags ?? []).filter((tag) =>
      q ? tag.value.toLowerCase().includes(q) : true
    );
    const sorted =
      browseSort === "popular"
        ? [...base].sort(
            (a, b) => b.count - a.count || a.value.localeCompare(b.value)
          )
        : [...base].sort((a, b) => a.value.localeCompare(b.value));
    return sorted;
  }, [tags, browseQuery, browseSort]);

  const selectTag = (value: string) => {
    if (selected.includes(value)) return;
    onChange([...selected, value]);
    setQuery("");
    setActiveIndex(0);
    setOpen(false);
  };

  const removeTag = (value: string) => {
    onChange(selected.filter((v) => v !== value));
  };

  const toggleTag = (value: string) => {
    if (selected.includes(value)) removeTag(value);
    else onChange([...selected, value]);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        ensureLoaded();
        setOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const hit = matches[activeIndex];
      if (open && hit) {
        e.preventDefault();
        selectTag(hit.value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const openBrowse = () => {
    ensureLoaded();
    setBrowseQuery("");
    setBrowseLimit(BROWSE_PAGE);
    setBrowseOpen(true);
  };

  const showNoMatch =
    open && !loading && matches.length === 0 && !loadError;

  return (
    <div>
      {/* Combobox */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && matches[activeIndex]
                ? optionId(activeIndex)
                : undefined
            }
            value={query}
            placeholder="Type to search tags..."
            autoComplete="off"
            onChange={(e) => {
              ensureLoaded();
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => {
              ensureLoaded();
              setOpen(true);
            }}
            onKeyDown={handleInputKeyDown}
            onBlur={() => setOpen(false)}
            className="w-full px-3 py-2 bg-ast-bg border border-ast-border rounded text-ast-text focus:outline-none focus:ring-2 focus:ring-ast-accent"
          />

          {open && loading && (
            <div
              role="status"
              className="absolute z-20 mt-1 w-full rounded border border-ast-border bg-ast-surface px-3 py-2 text-sm text-ast-muted shadow-lg"
            >
              Loading tags…
            </div>
          )}

          {open && loadError && (
            <div
              role="alert"
              className="absolute z-20 mt-1 w-full rounded border border-ast-border bg-ast-surface px-3 py-2 text-sm text-ast-muted shadow-lg"
            >
              Couldn&apos;t load tags. Focus the field to retry.
            </div>
          )}

          {open && !loading && !loadError && matches.length > 0 && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Matching tags"
              className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border border-ast-border bg-ast-surface shadow-lg"
            >
              {matches.map((tag, index) => (
                <li
                  key={tag.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectTag(tag.value)}
                  className={
                    "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm " +
                    (index === activeIndex
                      ? "bg-ast-tag text-ast-accent"
                      : "text-ast-text")
                  }
                >
                  <span>{tag.value}</span>
                  <span className="text-xs text-ast-muted">{tag.count}</span>
                </li>
              ))}
            </ul>
          )}

          {showNoMatch && (
            <div
              role="status"
              className="absolute z-20 mt-1 w-full rounded border border-ast-border bg-ast-surface px-3 py-2 text-sm text-ast-muted shadow-lg"
            >
              {query.trim()
                ? "No matching tags"
                : "No more tags to add — see Browse all tags"}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={openBrowse}
          className="shrink-0 px-4 py-2 border border-ast-border rounded text-ast-text hover:bg-ast-tag font-medium"
        >
          Browse all tags
        </button>
      </div>

      {/* Selected chips */}
      <ul
        aria-label="Selected interests"
        className="mt-3 flex flex-wrap gap-2"
      >
        {selected.map((value) => {
          const isLegacy = tags !== null && !knownValues.has(value);
          return (
            <li
              key={value}
              className={
                "flex items-center gap-2 rounded-full border px-3 py-1 text-sm " +
                (isLegacy
                  ? "border-ast-gold text-ast-gold"
                  : "border-ast-accent text-ast-accent")
              }
            >
              <span>{value}</span>
              {isLegacy && (
                <span className="rounded bg-ast-gold px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ast-tag">
                  legacy
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => removeTag(value)}
                className="text-ast-muted hover:text-ast-text"
              >
                ×
              </button>
            </li>
          );
        })}
        {selected.length === 0 && (
          <li className="text-sm text-ast-muted">No interests added yet</li>
        )}
      </ul>

      {/* Browse all tags modal */}
      {browseOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ast-bg p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => setBrowseOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Browse all tags"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBrowseOpen(false);
            }}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-lg border border-ast-border bg-ast-surface p-4 sm:rounded-lg"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-ast-text">
                Browse all tags
                {tags && (
                  <span className="ml-2 text-sm font-normal text-ast-muted">
                    {tags.length} tags
                  </span>
                )}
              </h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setBrowseOpen(false)}
                className="text-xl leading-none text-ast-muted hover:text-ast-text"
              >
                ×
              </button>
            </div>

            <input
              type="search"
              value={browseQuery}
              onChange={(e) => setBrowseQuery(e.target.value)}
              placeholder="Search tags..."
              autoFocus
              aria-label="Search tags"
              className="mb-3 w-full rounded border border-ast-border bg-ast-bg px-3 py-2 text-ast-text focus:outline-none focus:ring-2 focus:ring-ast-accent"
            />

            <div className="mb-3 flex gap-2" role="group" aria-label="Sort tags">
              <button
                type="button"
                aria-pressed={browseSort === "alpha"}
                onClick={() => setBrowseSort("alpha")}
                className={
                  "rounded border px-3 py-1 text-sm " +
                  (browseSort === "alpha"
                    ? "border-ast-accent bg-ast-tag text-ast-accent"
                    : "border-ast-border text-ast-muted")
                }
              >
                A–Z
              </button>
              <button
                type="button"
                aria-pressed={browseSort === "popular"}
                onClick={() => setBrowseSort("popular")}
                className={
                  "rounded border px-3 py-1 text-sm " +
                  (browseSort === "popular"
                    ? "border-ast-accent bg-ast-tag text-ast-accent"
                    : "border-ast-border text-ast-muted")
                }
              >
                Popular
              </button>
            </div>

            <ul className="flex-1 overflow-y-auto">
              {loading && (
                <li className="px-3 py-2 text-sm text-ast-muted">
                  Loading tags…
                </li>
              )}
              {!loading &&
                browseList.slice(0, browseLimit).map((tag) => {
                  const isSelected = selected.includes(tag.value);
                  return (
                    <li key={tag.value}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleTag(tag.value)}
                        className={
                          "flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm " +
                          (isSelected
                            ? "bg-ast-tag text-ast-accent"
                            : "text-ast-text hover:bg-ast-tag")
                        }
                      >
                        <span>
                          {isSelected ? "✓ " : ""}
                          {tag.value}
                        </span>
                        <span className="text-xs text-ast-muted">
                          {tag.count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              {!loading && loadError && (
                <li className="px-3 py-2 text-sm text-ast-muted">
                  Couldn&apos;t load tags. Close and focus the field to retry.
                </li>
              )}
              {!loading && !loadError && browseList.length === 0 && (
                <li className="px-3 py-2 text-sm text-ast-muted">
                  No matching tags
                </li>
              )}
            </ul>

            {browseList.length > browseLimit && (
              <button
                type="button"
                onClick={() => setBrowseLimit((n) => n + BROWSE_PAGE)}
                className="mt-3 w-full rounded border border-ast-border px-3 py-2 text-sm text-ast-text hover:bg-ast-tag"
              >
                Show more ({browseList.length - browseLimit} remaining)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
