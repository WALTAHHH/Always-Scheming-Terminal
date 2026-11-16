import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Source-assertion coverage for the watchlist UI (spec §5.2–5.4).
 * The repo intentionally avoids jsdom/RTL for component tests, so these assert
 * the shipped source carries the required wiring and empty-state copy.
 */

const signalPanel = readFileSync(
  path.resolve(__dirname, 'SignalPanel.tsx'),
  'utf-8'
);
const header = readFileSync(path.resolve(__dirname, 'Header.tsx'), 'utf-8');

describe('SignalPanel Watchlist filter (spec §5.2, §5.4)', () => {
  it('adds "watchlist" to the source filter union and renders a chip', () => {
    expect(signalPanel).toMatch(
      /type SourceFilter = "all" \| "analysis" \| "news" \| "watchlist"/
    );
    expect(signalPanel).toContain('★ Watchlist');
  });

  it('fetches the user watchlist and matches signal companies case-insensitively', () => {
    expect(signalPanel).toContain('/api/v1/watchlist');
    expect(signalPanel).toContain('canonical_name');
    expect(signalPanel).toMatch(/toLowerCase\(\)/);
    expect(signalPanel).toMatch(/sourceFilter !== "watchlist"/);
  });

  it('renders the Watchlist empty-state copy', () => {
    expect(signalPanel).toContain(
      'No signals for the companies you watch yet. Watch more companies to widen the net.'
    );
  });

  it('keeps the watchlist chip from collapsing the feed to news-only', () => {
    expect(signalPanel).toMatch(
      /sourceFilter === "all" \|\| sourceFilter === "watchlist"/
    );
  });
});

describe('Header unread badge (spec §5.3, §5.4)', () => {
  it('polls GET /api/v1/alerts?unread=1 for the badge count', () => {
    expect(header).toContain('/api/v1/alerts?unread=1');
    expect(header).toContain('typeof data?.unread === "number"');
  });

  it('renders the badge only when unread > 0 (never a lone "0" pill)', () => {
    expect(header).toMatch(/\{unread > 0 && \(/);
    expect(header).toContain('unread > 99 ? "99+" : unread');
  });

  it('opens an alerts list and marks rows read via PATCH', () => {
    expect(header).toContain('/api/v1/alerts?unread_only=1&limit=20');
    expect(header).toContain('method: "PATCH"');
    expect(header).toContain('JSON.stringify({ ids })');
    expect(header).toContain('JSON.stringify({ all: true })');
  });

  it('renders the alerts empty state', () => {
    expect(header).toContain('No unread alerts.');
  });
});
