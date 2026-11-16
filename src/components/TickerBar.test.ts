import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

// Regression tests for the TickerBar race condition + marquee wiring.
// Ported from PR #121 (7aeaa154) onto main while preserving #126's title tooltip.
// Style matches the other component tests in this repo (source assertions).
describe('TickerBar race + marquee fix', () => {
  const source = readFileSync(path.resolve(__dirname, 'TickerBar.tsx'), 'utf-8')

  describe('price-fetch race condition', () => {
    it('guards the price effect until entities have loaded', () => {
      expect(source).toMatch(/if\s*\(\s*entities\.length\s*===\s*0\s*\)\s*return/)
    })

    it('re-runs the price effect when entities / fetchAll change', () => {
      expect(source).toMatch(/\},\s*\[entities,\s*fetchAll\]\)/)
    })

    it('memoizes fetchAll so the effect does not re-run every render', () => {
      // fetchAll must be a stable reference (useCallback) or the [entities, fetchAll]
      // dependency array would re-trigger on every render -> infinite fetch loop.
      expect(source).toMatch(/const\s+fetchAll\s*=\s*useCallback\(/)
      expect(source).toMatch(/const\s+fetchStock\s*=\s*useCallback\(/)
    })

    it('does not fetch prices against an empty ticker list', () => {
      // fetchAll derives tickers from entities, not the (initially empty) stocks array
      expect(source).toMatch(/entities\.map\(\(entity\)\s*=>\s*fetchStock\(entity\.ticker\)\)/)
    })
  })

  describe('marquee scroll wiring', () => {
    it('clips overflow on the outer container', () => {
      expect(source).toMatch(/hidden sm:flex[^"]*overflow-hidden/)
    })

    it('applies animate-ticker-scroll only when scrollEnabled is true', () => {
      expect(source).toMatch(/scrollEnabled\s*\?\s*styles\["animate-ticker-scroll"\]/)
      expect(source).toMatch(/style=\{\{\s*width:\s*"max-content"\s*\}\}/)
    })

    it('renders the stocks list twice for a seamless loop', () => {
      expect(source).toContain('[...stocks, ...stocks]')
      // keys must be unique across the doubled list
      expect(source).toMatch(/key=\{`\$\{stock\.ticker\}-\$\{idx\}`\}/)
    })
  })

  describe('#126 tooltip + drawer behaviour preserved', () => {
    it('keeps the title tooltip', () => {
      expect(source).toMatch(/title=\{`\$\{stock\.ticker\}/)
    })

    it('keeps the click-to-drawer handler', () => {
      expect(source).toMatch(/onClick=\{\(\)\s*=>\s*\{/)
      expect(source).toContain('openCompanyDrawer(entity.canonical_name)')
    })
  })

  describe('marquee scroll speed', () => {
    const css = readFileSync(path.resolve(__dirname, 'TickerBar.module.css'), 'utf-8')

    it('declares the duration as a single named constant', () => {
      // one custom property is the sole source of truth for the speed
      const declarations = css.match(/--ticker-scroll-duration\s*:/g) ?? []
      expect(declarations).toHaveLength(1)
      expect(css).toMatch(/--ticker-scroll-duration:\s*[\d.]+s/)
    })

    it('drives the animation from that constant (no hard-coded duration)', () => {
      expect(css).toMatch(/animation:\s*ticker-scroll\s+var\(--ticker-scroll-duration\)\s+linear\s+infinite/)
      // the old hard-coded 40s literal must be gone
      expect(css).not.toMatch(/animation:\s*ticker-scroll\s+\d+s/)
    })

    it('is roughly 40-50% slower than the original 40s loop', () => {
      const match = css.match(/--ticker-scroll-duration:\s*([\d.]+)s/)
      expect(match).not.toBeNull()
      const durationSeconds = Number(match![1])
      const ORIGINAL_DURATION_SECONDS = 40
      // speed is inversely proportional to duration
      const speedRatio = ORIGINAL_DURATION_SECONDS / durationSeconds
      expect(speedRatio).toBeGreaterThanOrEqual(0.5) // >= 40% slower
      expect(speedRatio).toBeLessThanOrEqual(0.6) // <= 40% slower
    })
  })
})
