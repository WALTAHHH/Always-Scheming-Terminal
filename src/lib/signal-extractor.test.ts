import { describe, it, expect } from 'vitest';
import { shouldExtractSignal, type ItemForGate } from './signal-extractor';

describe('signal-extractor.ts', () => {
  describe('shouldExtractSignal()', () => {
    it('should fire on importanceScore >= 0.4 + high-value category', () => {
      const item: ItemForGate = {
        id: 'test-1',
        title: 'Test',
        body: '',
        tags: { category: ['earnings'] },
        sources: { source_type: 'analysis' },
      };
      const importanceScore = 0.5;
      const hasResolvedEntity = false;

      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity);
      expect(result).toBe(true);
    });

    it('should fire on resolved entity + category', () => {
      const item: ItemForGate = {
        id: 'test-2',
        title: 'Test',
        body: '',
        tags: { category: ['analysis'] },
        sources: { source_type: 'news' },
      };
      const importanceScore = 0.2; // low
      const hasResolvedEntity = true;

      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity);
      expect(result).toBe(true);
    });

    it('should NOT fire on low score + non-high-value category', () => {
      const item: ItemForGate = {
        id: 'test-3',
        title: 'Test',
        body: '',
        tags: { category: ['opinion'] }, // not high-value
        sources: { source_type: 'news' },
      };
      const importanceScore = 0.3; // below 0.4
      const hasResolvedEntity = false;

      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity);
      expect(result).toBe(false);
    });

    it('should NOT fire when no category present (even with resolved entity)', () => {
      const item: ItemForGate = {
        id: 'test-4',
        title: 'Test',
        body: '',
        tags: {}, // no category
        sources: { source_type: 'news' },
      };
      const importanceScore = 0.0;
      const hasResolvedEntity = true;

      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity);
      expect(result).toBe(false);
    });

    it('should fire on high-value category even with low importance?', () => {
      const item: ItemForGate = {
        id: 'test-5',
        title: 'Test',
        body: '',
        tags: { category: ['earnings'] },
        sources: { source_type: 'news' },
      };
      const importanceScore = 0.4; // threshold exactly
      const hasResolvedEntity = false;

      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity);
      expect(result).toBe(true);
    });
  });
});