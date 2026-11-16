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
})

// Hover styling parity with the rest of the site.
// Dominant convention (surveyed across FeedRow/SignalPanel/FilterBar/Header):
//   row hover -> bg tint `hover:bg-ast-mint/5` + `transition-colors`
//   hovered text -> `group-hover:text-ast-accent`
//   keyboard focus -> `focus:outline-none focus:ring-2 focus:ring-ast-accent(/50)`
// All colours come from ast-* theme tokens so both themes are covered.
describe('TickerBar hover styling parity', () => {
  const source = readFileSync(path.resolve(__dirname, 'TickerBar.tsx'), 'utf-8')

  it('uses the site row-hover bg tint token (hover:bg-ast-mint/5)', () => {
    expect(source).toContain('hover:bg-ast-mint/5')
    // the old, one-off hover:bg-ast-surface is gone
    expect(source).not.toContain('hover:bg-ast-surface')
  })

  it('animates the hover state with transition-colors', () => {
    expect(source).toMatch(/className="group[^"]*transition-colors[^"]*hover:bg-ast-mint\/5/)
  })

  it('highlights the ticker symbol on hover via group-hover:text-ast-accent', () => {
    expect(source).toContain('group-hover:text-ast-accent')
  })

  it('makes items keyboard focusable as buttons (focus-visible parity)', () => {
    expect(source).toMatch(/<button[\s\S]*?key=\{`\$\{stock\.ticker\}-/)
    expect(source).toMatch(/type="button"[\s\S]*?onClick/)
    expect(source).toMatch(/focus-visible:ring-2/)
    expect(source).toMatch(/focus-visible:ring-ast-accent/)
  })

  it('keeps the pointer cursor on hoverable items', () => {
    expect(source).toContain('cursor-pointer')
  })
})
