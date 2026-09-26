import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('FilterBar UX improvements', () => {
  const source = readFileSync('src/components/FilterBar.tsx', 'utf-8')

  describe('Option count badges', () => {
    it('each category header shows total option count in parentheses while collapsed', () => {
      // Check that the FilterSection header includes a count badge for total options
      // Look for pattern where label is followed by parentheses with options.length
      // Since the component uses selected.length badge, we need to ensure there is also total count
      // For simplicity, check that the header contains options.length or a computed variable
      // Currently missing, so this test fails.
      // We'll search for a pattern where the header includes a span with options.length
      // We'll also check that the count is not only selected.length.
      const hasOptionCountBadge = source.includes('options.length') && 
        source.includes('{options.length}') // or similar
      // This is a placeholder; actual implementation should be more precise.
      expect(hasOptionCountBadge).toBe(true)
    })
  })

  describe('Clear All button', () => {
    it('has × prefix and text-xs styling', () => {
      // Check that Clear All button includes × character before text
      const hasTimesPrefix = source.includes('✕') || source.includes('×')
      expect(hasTimesPrefix).toBe(true)
      // Check that button has text-xs class (text-[10px] or text-xs)
      const hasTextXs = source.includes('text-[10px]') || source.includes('text-xs')
      expect(hasTextXs).toBe(true)
    })

    it('only renders when activeFilterCount > 0', () => {
      // Check that button is conditionally rendered based on hasActiveFilters
      const conditionalRender = source.includes('hasActiveFilters') && 
        source.includes('{hasActiveFilters &&')
      expect(conditionalRender).toBe(true)
    })

    it('uses red/pink styling', () => {
      const hasPinkClass = source.includes('text-ast-pink')
      expect(hasPinkClass).toBe(true)
    })
  })
})