import { describe, it, expect } from 'vitest';
import { scoreItem, scoreCluster } from './importance';
import type { FeedItem } from './database.types';
import type { StoryCluster } from './cluster';

describe('importance.ts', () => {
  describe('scoreItem()', () => {
    it('should score high-signal item (earnings + analysis source + 3 companies) > 0.5', () => {
      const highSignalItem: FeedItem = {
        id: 'test-1',
        title: 'Apple reports $100 billion revenue, 10% growth in Q4',
        tags: {
          category: ['earnings'],
          company: ['Apple', 'Microsoft', 'Google'],
        },
        sources: {
          source_type: 'analysis',
        },
      } as any;

      const score = scoreItem(highSignalItem);
      expect(score).toBeGreaterThan(0.5);
      // Category weight 0.30 + source 0.15 + companies (>=3) 0.15 + financial signals ≈ 0.15
      expect(score).toBeCloseTo(0.75, 0.1);
    });

    it('should score low-signal item (no category, single company, news source) < 0.2', () => {
      const lowSignalItem: FeedItem = {
        id: 'test-2',
        title: 'Apple releases new iPhone',
        tags: {
          company: ['Apple'],
        },
        sources: {
          source_type: 'news',
        },
      } as any;

      const score = scoreItem(lowSignalItem);
      expect(score).toBeLessThan(0.2);
      // Source 0.10 + company (single) 0.05 ≈ 0.15
      expect(score).toBeCloseTo(0.15, 0.1);
    });

    it('should handle no tags gracefully', () => {
      const item: FeedItem = {
        id: 'test-3',
        title: 'Some article',
        tags: {},
        sources: {
          source_type: 'news',
        },
      } as any;

      const score = scoreItem(item);
      // Source weight 0.10 only
      expect(score).toBe(0.10);
    });

    it('should cap at 1.0', () => {
      const maxItem: FeedItem = {
        id: 'test-4',
        title: '$1 billion earnings M&A revenue profit',
        tags: {
          category: ['earnings', 'm-and-a'],
          company: ['A', 'B', 'C', 'D', 'E'],
          sector: ['Tech'],
          region: ['US'],
        },
        sources: {
          source_type: 'analysis',
        },
      } as any;

      const score = scoreItem(maxItem);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('scoreCluster()', () => {
    it('should add cluster bonus correctly', () => {
      const leadItem: FeedItem = {
        id: 'lead',
        title: 'Test',
        tags: { category: ['analysis'] },
        sources: { source_type: 'analysis' },
      } as any;

      const cluster: StoryCluster = {
        id: 'test-cluster',
        lead: leadItem,
        related: [],
        sourceCount: 12,
        sourceNames: ['Test Source'],
        isMultiSource: true,
      };

      const score = scoreCluster(cluster);
      // Lead score: category 0.08 + source 0.15 = 0.23
      // Multi-source bonus: 0.15
      // Expect ~0.38
      expect(score).toBeGreaterThan(0.23);
    });
  });
});