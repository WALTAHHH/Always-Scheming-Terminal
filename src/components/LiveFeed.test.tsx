/// <reference types=\"vitest\" />
/// @vitest-environment node

import React from 'react';
import { renderToString } from 'react-dom/server';
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
    // Ensure bg-ast-surface is not present in the tab bar div
    expect(html).not.toContain('bg-ast-surface');
    // Instead active tab should have border-b-2 border-ast-accent
    expect(html).toContain('border-b-2 border-ast-accent');
  });

  it('should have dark mode background class bg-ast-bg', () => {
    const html = renderToString(<LiveFeed {...mockProps} />);
    expect(html).toContain('bg-ast-bg');
  });
});