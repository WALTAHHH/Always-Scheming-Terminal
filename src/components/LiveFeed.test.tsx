/// <reference types=\"vitest\" />
/// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
// Feed (rendered by LiveFeed) calls the Next.js app-router hooks, which throw
// "invariant expected app router to be mounted" outside a real Next runtime.
// Provide the minimal surface the component tree touches so the server render
// can proceed in this node-environment suite.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
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
    // Scope to the active tab button. LiveFeed legitimately uses bg-ast-surface
    // elsewhere (pane splitter, footer, inactive-tab hover), so a whole-document
    // check is too broad; the active tab is what must not use it.
    const activeTab = html.match(/<button[^>]*aria-pressed="true"[^>]*>FEED<\/button>/)?.[0] ?? '';
    expect(activeTab).not.toContain('bg-ast-surface');
    // Instead active tab should have border-b-2 border-ast-accent
    expect(html).toContain('border-b-2 border-ast-accent');
  });

  it('should have dark mode background class bg-ast-bg', () => {
    const html = renderToString(<LiveFeed {...mockProps} />);
    expect(html).toContain('bg-ast-bg');
  });
});