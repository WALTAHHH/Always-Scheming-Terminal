/// <reference types="vitest" />
/// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// LiveFeed → SignalPanel → Feed uses the App Router hooks; renderToString has no
// router mounted, so stub next/navigation for this node-environment test.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import { LiveFeed } from './LiveFeed';

describe('LiveFeed tab bar', () => {
  const mockProps = {
    initialItems: [],
    initialHasMore: false,
    sources: [],
  };

  it('should render FEED and SIGNALS labels', () => {
    const html = renderToString(<LiveFeed {...mockProps} />);
    expect(html).toContain('FEED');
    expect(html).toContain('SIGNALS');
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