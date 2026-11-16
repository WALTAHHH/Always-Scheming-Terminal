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
      expect(source).toMatch(/onClick=\{\s*\(\)\s*=>\s*\{/)
      expect(source).toContain('openCompanyDrawer(entity.canonical_name)')
    })
  })

  // Pause-on-hover/focus so a moving ticker item can be examined (issue: hover pause).
  describe('pause scroll on hover / focus', () => {
    const css = readFileSync(path.resolve(__dirname, 'TickerBar.module.css'), 'utf-8')

    it('tags the ticker bar container with the ticker-bar class', () => {
      expect(source).toMatch(/styles\["ticker-bar"\]/)
    })

    it('pauses the marquee while the bar is hovered', () => {
      expect(css).toMatch(/\.ticker-bar:hover \.animate-ticker-scroll/)
      expect(css).toMatch(/animation-play-state:\s*paused/)
    })

    it('pauses the marquee while the bar has keyboard focus', () => {
      expect(css).toMatch(/\.ticker-bar:focus-within \.animate-ticker-scroll/)
    })

    it('disables the marquee animation under prefers-reduced-motion: reduce', () => {
      const reduced = css.match(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\}/
      )
      expect(reduced).not.toBeNull()
      expect(reduced![0]).toMatch(/\.animate-ticker-scroll/)
      expect(reduced![0]).toMatch(/animation:\s*none/)
    })
  })
})
