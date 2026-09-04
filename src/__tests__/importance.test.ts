import { describe, it, expect } from 'vitest'
import { scoreItem, scoreCluster } from '@/lib/importance'
import type { FeedItem } from '@/lib/database.types'
import type { StoryCluster } from '@/lib/cluster'

describe('importance.ts', () => {
  describe('scoreItem', () => {
    it('should score high-signal item (earnings + analysis source + 3 companies) > 0.5', () => {
      const item: FeedItem = {
        id: 'test',
        title: 'Apple reports $10B revenue, up 20%',
        tags: {
          category: ['earnings'],
          company: ['Apple', 'Microsoft', 'Google'],
        },
        sources: {
          name: 'Analysis Source',
          url: '',
          source_type: 'analysis',
        },
        // other required fields (partial)
        source_id: null,
        external_id: null,
        body: null,
        url: '',
        author: null,
        published_at: null,
        ingested_at: null,
        content_type: 'article',
        embedding: null,
        signals_extracted_at: null,
      }
      const score = scoreItem(item)
      expect(score).toBeGreaterThan(0.5)
      // Also ensure score is <= 1
      expect(score).toBeLessThanOrEqual(1)
    })

    it('should score low-signal item (no category, single company, news source) < 0.2', () => {
      const item: FeedItem = {
        id: 'test2',
        title: 'Some news article',
        tags: {
          company: ['Unknown'],
        },
        sources: {
          name: 'News',
          url: '',
          source_type: 'news',
        },
        source_id: null,
        external_id: null,
        body: null,
        url: '',
        author: null,
        published_at: null,
        ingested_at: null,
        content_type: 'article',
        embedding: null,
        signals_extracted_at: null,
      }
      const score = scoreItem(item)
      expect(score).toBeLessThan(0.2)
      expect(score).toBeGreaterThanOrEqual(0)
    })

    it('should add cluster bonus correctly', () => {
      // Create a cluster with multi-source and related items
      const lead: FeedItem = {
        id: 'lead',
        title: 'Lead item',
        tags: { category: ['earnings'] },
        sources: { name: 'Analysis', url: '', source_type: 'analysis' },
        source_id: null,
        external_id: null,
        body: null,
        url: '',
        author: null,
        published_at: null,
        ingested_at: null,
        content_type: 'article',
        embedding: null,
        signals_extracted_at: null,
      }
      const related: FeedItem[] = [
        {
          id: 'related1',
          title: 'Related item',
          tags: { category: ['earnings'] },
          sources: { name: 'News', url: '', source_type: 'news' },
          source_id: null,
          external_id: null,
          body: null,
          url: '',
          author: null,
          published_at: null,
          ingested_at: null,
          content_type: 'article',
          embedding: null,
          signals_extracted_at: null,
        },
      ]
      const cluster: StoryCluster = {
        id: 'cluster1',
        lead,
        related,
        sourceCount: 2,
        sourceNames: ['Analysis', 'News'],
        isMultiSource: true,
      }
      const score = scoreCluster(cluster)
      // Expect bonus for multi-source (0.15) plus cluster size bonus (0.02 per related)
      const leadScore = scoreItem(lead)
      const expected = Math.min(leadScore + 0.15 + 0.02, 1)
      expect(score).toBeCloseTo(expected, 2)
    })
  })
})