import { describe, it, expect } from 'vitest'
import { shouldExtractSignal } from '@/lib/signal-extractor'

describe('signal-extractor.ts', () => {
  describe('shouldExtractSignal', () => {
    const mockItem = (tags: Record<string, string[]>, sourceType = 'news') => ({
      id: 'test',
      title: 'Test title',
      body: 'Test body',
      tags,
      sources: { source_type: sourceType },
    })

    it('should fire gate on importanceScore >= 0.4 + high-value category', () => {
      const item = mockItem({ category: ['earnings'] })
      const importanceScore = 0.5
      const hasResolvedEntity = false
      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity)
      expect(result).toBe(true)
    })

    it('should fire gate on resolved entity + category', () => {
      const item = mockItem({ category: ['earnings'] })
      const importanceScore = 0.1 // low score
      const hasResolvedEntity = true
      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity)
      expect(result).toBe(true)
    })

    it('should NOT fire on low score + non-high-value category', () => {
      const item = mockItem({ category: ['opinion'] })
      const importanceScore = 0.3 // below threshold
      const hasResolvedEntity = false
      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity)
      expect(result).toBe(false)
    })

    it('should NOT fire on low score + no category', () => {
      const item = mockItem({})
      const importanceScore = 0.3
      const hasResolvedEntity = false
      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity)
      expect(result).toBe(false)
    })

    it('should NOT fire on high score + non-high-value category', () => {
      const item = mockItem({ category: ['opinion'] })
      const importanceScore = 0.6
      const hasResolvedEntity = false
      const result = shouldExtractSignal(item, importanceScore, hasResolvedEntity)
      expect(result).toBe(false)
    })
  })
})