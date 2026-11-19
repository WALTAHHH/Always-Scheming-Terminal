/// <reference types="vitest" />
/// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  SIGNALS_COLLAPSED_COUNT,
  EXPANSION_STORAGE_KEY,
  DEFAULT_EXPANSION,
  toggleSection,
  getVisibleCount,
  getHiddenCount,
  sliceVisible,
  parseExpansion,
  serializeExpansion,
  readExpansion,
  writeExpansion,
  type ReadableStorage,
} from './sectionExpansion';

/** In-memory Storage stub. `throwOnSet` simulates a full/blocked storage. */
function makeStorage(initial: Record<string, string> = {}, throwOnSet = false): ReadableStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      if (throwOnSet) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
  };
}

describe('sectionExpansion constants', () => {
  it('caps collapsed sections at 6 by default', () => {
    expect(SIGNALS_COLLAPSED_COUNT).toBe(6);
  });
});

describe('toggleSection', () => {
  it('expands a collapsed section', () => {
    expect(toggleSection(DEFAULT_EXPANSION, 'signals')).toEqual({ signals: true, deals: false });
  });

  it('collapses an expanded section', () => {
    expect(toggleSection({ signals: true, deals: false }, 'signals')).toEqual({
      signals: false,
      deals: false,
    });
  });

  it('toggles sections independently', () => {
    const once = toggleSection(DEFAULT_EXPANSION, 'deals');
    expect(once).toEqual({ signals: false, deals: true });
    // toggling "signals" must not disturb the already-expanded "deals"
    const twice = toggleSection(once, 'signals');
    expect(twice).toEqual({ signals: true, deals: true });
  });

  it('does not mutate the input state', () => {
    const state = { signals: false, deals: false };
    toggleSection(state, 'signals');
    expect(state).toEqual({ signals: false, deals: false });
  });
});

describe('getVisibleCount / getHiddenCount', () => {
  it('shows at most the collapsed count while collapsed', () => {
    expect(getVisibleCount(23, false)).toBe(6);
    expect(getHiddenCount(23, false)).toBe(17);
  });

  it('shows everything while expanded', () => {
    expect(getVisibleCount(23, true)).toBe(23);
    expect(getHiddenCount(23, true)).toBe(0);
  });

  it('does not pad short sections', () => {
    expect(getVisibleCount(4, false)).toBe(4);
    expect(getHiddenCount(4, false)).toBe(0);
  });

  it('treats an exactly-cap-sized section as having nothing hidden', () => {
    expect(getVisibleCount(6, false)).toBe(6);
    expect(getHiddenCount(6, false)).toBe(0);
  });

  it('honours a custom collapsed count', () => {
    expect(getVisibleCount(10, false, 3)).toBe(3);
    expect(getHiddenCount(10, true, 3)).toBe(0);
  });

  it('never returns a negative hidden count', () => {
    expect(getHiddenCount(0, false)).toBe(0);
  });
});

describe('sliceVisible', () => {
  const items = Array.from({ length: 23 }, (_, i) => i);

  it('returns the top N while collapsed, preserving order', () => {
    expect(sliceVisible(items, false)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('returns every item while expanded', () => {
    expect(sliceVisible(items, true)).toHaveLength(23);
  });

  it('returns the whole list when it is shorter than the cap', () => {
    expect(sliceVisible(['a', 'b'], false)).toEqual(['a', 'b']);
  });
});

describe('parseExpansion / serializeExpansion', () => {
  it('round-trips an expansion state', () => {
    const state = { signals: true, deals: false };
    expect(parseExpansion(serializeExpansion(state))).toEqual(state);
  });

  it('falls back to defaults for null / empty input', () => {
    expect(parseExpansion(null)).toEqual(DEFAULT_EXPANSION);
    expect(parseExpansion('')).toEqual(DEFAULT_EXPANSION);
  });

  it('falls back to defaults for malformed JSON', () => {
    expect(parseExpansion('{not json')).toEqual(DEFAULT_EXPANSION);
  });

  it('coerces non-boolean / missing fields to false', () => {
    expect(parseExpansion('{"signals":"yes"}')).toEqual({ signals: false, deals: false });
    expect(parseExpansion('{}')).toEqual({ signals: false, deals: false });
  });

  it('ignores unknown keys', () => {
    expect(parseExpansion('{"signals":true,"legacy":true}')).toEqual({
      signals: true,
      deals: false,
    });
  });
});

describe('readExpansion / writeExpansion', () => {
  it('writes and reads back through a storage stub', () => {
    const storage = makeStorage();
    writeExpansion(storage, { signals: true, deals: true });
    expect(storage.getItem(EXPANSION_STORAGE_KEY)).toBe('{"signals":true,"deals":true}');
    expect(readExpansion(storage)).toEqual({ signals: true, deals: true });
  });

  it('returns defaults when nothing is stored', () => {
    expect(readExpansion(makeStorage())).toEqual(DEFAULT_EXPANSION);
  });

  it('returns defaults when storage is null/undefined', () => {
    expect(readExpansion(null)).toEqual(DEFAULT_EXPANSION);
    expect(readExpansion(undefined)).toEqual(DEFAULT_EXPANSION);
  });

  it('swallows a throwing storage on write', () => {
    const storage = makeStorage({}, true);
    expect(() => writeExpansion(storage, { signals: true, deals: false })).not.toThrow();
  });

  it('swallows a throwing storage on read', () => {
    const storage: ReadableStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    };
    expect(readExpansion(storage)).toEqual(DEFAULT_EXPANSION);
  });
});
