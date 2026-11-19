/// <reference types="vitest" />
/// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';

// LiveFeed → SignalPanel → Feed uses the App Router hooks; renderToString has no
// router mounted, so stub next/navigation for this node-environment test.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import {
  LiveFeed,
  parseLayout,
  layoutToPanels,
  migrateLegacyLayout,
  LAYOUT_STORAGE_KEY,
  DEFAULT_LAYOUT,
} from './LiveFeed';

const componentSource = readFileSync(new URL('./LiveFeed.tsx', import.meta.url), 'utf8');

describe('LiveFeed tab bar', () => {
  const mockProps = {
    initialItems: [],
    initialHasMore: false,
    sources: [],
  };

  it('should render FEED, SIGNALS and SPLIT labels', () => {
    const html = renderToString(<LiveFeed {...mockProps} />);
    expect(html).toContain('FEED');
    expect(html).toContain('SIGNALS');
    expect(html).toContain('SPLIT');
  });

  it('defaults to Split with exactly one active pill (no fallback-to-feed lie)', () => {
    const html = renderToString(<LiveFeed {...mockProps} />);
    // Exactly one tab pill is pressed — the old code highlighted FEED even while
    // both panes rendered, which is the bug this card fixes. Scope to the tab
    // bar buttons (class flex-1) so unrelated aria-pressed toggles elsewhere in
    // the tree don't count.
    const pressed = html.match(/aria-pressed="true" class="flex-1/g) ?? [];
    expect(pressed).toHaveLength(1);
    const start = html.indexOf('aria-pressed="true" class="flex-1');
    const button = html.slice(start, html.indexOf('</button>', start));
    expect(button).toContain('SPLIT');
  });

  it('should not contain bg-ast-surface class on active tab', () => {
    const html = renderToString(<LiveFeed {...mockProps} />);
    // Scope the assertion to the ACTIVE tab button (the inactive tab's
    // hover:bg-ast-surface/50 and the footer's bg-ast-surface are expected);
    // the original whole-document check was stale.
    const activeTabStart = html.indexOf('aria-pressed="true" class="flex-1');
    const activeTabEnd = html.indexOf('</button>', activeTabStart);
    const activeTab = html.slice(activeTabStart, activeTabEnd);
    expect(activeTab).not.toContain('bg-ast-surface');
    // Instead active tab should have border-b-2 border-ast-accent
    expect(activeTab).toContain('border-b-2 border-ast-accent');
  });

  it('should have dark mode background class bg-ast-bg', () => {
    const html = renderToString(<LiveFeed {...mockProps} />);
    expect(html).toContain('bg-ast-bg');
  });
});

describe('LiveFeed layout state model', () => {
  it('parseLayout accepts the three valid modes and falls back to split', () => {
    expect(parseLayout('feed')).toBe('feed');
    expect(parseLayout('signal')).toBe('signal');
    expect(parseLayout('split')).toBe('split');
    expect(parseLayout(null)).toBe('split');
    expect(parseLayout('')).toBe('split');
    expect(parseLayout('nonsense')).toBe('split');
    expect(DEFAULT_LAYOUT).toBe('split');
  });

  it('layoutToPanels maps each state to pane visibility', () => {
    expect(layoutToPanels('feed')).toEqual({ feed: true, signal: false });
    expect(layoutToPanels('signal')).toEqual({ feed: false, signal: true });
    expect(layoutToPanels('split')).toEqual({ feed: true, signal: true });
  });

  it('migrateLegacyLayout maps the legacy ast-panel-visibility blob', () => {
    expect(migrateLegacyLayout(JSON.stringify({ feed: true, signal: true }))).toBe('split');
    expect(migrateLegacyLayout(JSON.stringify({ feed: true, signal: false }))).toBe('feed');
    expect(migrateLegacyLayout(JSON.stringify({ feed: false, signal: true }))).toBe('signal');
    expect(migrateLegacyLayout(JSON.stringify({ feed: false, signal: false }))).toBeNull();
    expect(migrateLegacyLayout(null)).toBeNull();
    expect(migrateLegacyLayout('not json')).toBeNull();
  });
});

describe('LiveFeed source assertions', () => {
  it('persists the layout choice under the ast.layout key', () => {
    expect(LAYOUT_STORAGE_KEY).toBe('ast.layout');
    expect(componentSource).toContain('LAYOUT_STORAGE_KEY');
    // Read after mount (inside an effect) so SSR/hydration stay consistent.
    expect(componentSource).toMatch(/localStorage\.getItem\(LAYOUT_STORAGE_KEY\)/);
  });

  it('does not reintroduce panel-toggle/resize keyboard shortcuts', () => {
    expect(componentSource).not.toMatch(/keydown/i);
    expect(componentSource).not.toMatch(/addEventListener\(\s*['"]key/);
  });
});
