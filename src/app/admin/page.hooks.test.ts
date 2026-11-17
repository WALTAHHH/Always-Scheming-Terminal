/**
 * Regression test for the AST admin "Entities" tab crash.
 *
 * Symptom: clicking Admin -> Entities rendered
 *   "Application error: a client-side exception has occurred"
 * with a minified React error #310 in the console
 * ("Rendered more hooks than during the previous render").
 *
 * Root cause: EntitiesDashboard() called three useMemo hooks (uniqueSegments,
 * uniqueTypes, filteredEntities) *after* its early `return`s for the loading /
 * error / empty states. The very first render (loading === true) bailed out
 * before those hooks, the loaded render reached them -> the hook count grew
 * between renders -> React #310.
 *
 * The invariant that must hold for every component in admin/page.tsx:
 *   No hook may be called after the first unconditional/conditional early
 *   `return`. If one is, some render paths execute a different number of hooks
 *   than others and React will throw.
 *
 * This file is a source-assertion test: rendering the real client component
 * would need jsdom + a React client renderer, neither of which this project
 * depends on. The detector below is itself unit-tested against a deliberately
 * buggy fixture (test 2) so it is provably able to catch the #310 pattern.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

const PAGE_FILE = path.resolve(__dirname, 'page.tsx')

/** Matches React hook identifiers: use*, useState, useMemo, ... */
const HOOK_RE = /^use[A-Z0-9]/

export interface HookViolation {
  component: string
  hook: string
  line: number
  column: number
}

/** True if `expr` is a hook call target: `useX` or `React.useX`. */
function hookNameOf(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr) && HOOK_RE.test(expr.text)) return expr.text
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name) && HOOK_RE.test(expr.name.text)) {
    return expr.name.text
  }
  return null
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  )
}

/** Name of a component-like function, or null if it isn't one. */
function componentName(node: ts.Node): string | null {
  if (!isFunctionLike(node)) return null
  const named = (node as ts.FunctionDeclaration | ts.MethodDeclaration).name
  if (named && ts.isIdentifier(named) && /^[A-Z]/.test(named.text)) return named.text
  // `const Foo = () => {}` / `const Foo = function () {}`
  const parent = node.parent
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && /^[A-Z]/.test(parent.name.text)) {
    return parent.name.text
  }
  return null
}

/** Does this statement (or any branch of it) contain a `return`? */
function containsReturn(node: ts.Node): boolean {
  let found = false
  const visit = (n: ts.Node) => {
    if (found) return
    if (ts.isReturnStatement(n)) {
      found = true
      return
    }
    // Don't descend into nested function bodies — their returns are their own.
    if (n !== node && isFunctionLike(n)) return
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/** Is this top-level statement an early-exit (conditional `if (...)` return or bare return)? */
function isEarlyExit(stmt: ts.Statement): boolean {
  if (ts.isReturnStatement(stmt)) return true
  if (ts.isIfStatement(stmt)) return containsReturn(stmt.thenStatement)
  return false
}

/** Collect hook calls reachable in `node`, without descending into nested functions. */
function collectHooks(node: ts.Node, sf: ts.SourceFile, out: { hook: string; pos: number }[]) {
  const visit = (n: ts.Node) => {
    if (isFunctionLike(n) && n !== node) return
    if (ts.isCallExpression(n)) {
      const name = hookNameOf(n.expression)
      if (name) out.push({ hook: name, pos: n.getStart(sf) })
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
}

/**
 * Scan a TSX source for components that call a hook after their first early
 * `return`. Pure function (no I/O) so it can be pointed at fixture strings.
 */
export function findHooksAfterEarlyReturn(fileName: string, source: string): HookViolation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const violations: HookViolation[] = []

  const walk = (node: ts.Node) => {
    const name = componentName(node)
    if (name) {
      const body = (node as ts.FunctionLikeDeclaration).body
      if (body && ts.isBlock(body)) {
        const firstExit = body.statements.findIndex(isEarlyExit)
        if (firstExit !== -1) {
          const found: { hook: string; pos: number }[] = []
          for (const stmt of body.statements.slice(firstExit + 1)) {
            collectHooks(stmt, sf, found)
          }
          for (const h of found) {
            const { line, character } = sf.getLineAndCharacterOfPosition(h.pos)
            violations.push({ component: name, hook: h.hook, line: line + 1, column: character + 1 })
          }
        }
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return violations
}

describe('admin/page.tsx — hooks must not appear after an early return', () => {
  it('has no component calling a hook after its first early return', () => {
    const source = fs.readFileSync(PAGE_FILE, 'utf-8')
    const violations = findHooksAfterEarlyReturn(PAGE_FILE, source)
    const rendered = violations.map(v => `  ${v.component}():${v.line}:${v.column} -> ${v.hook}()`).join('\n')
    expect(
      violations,
      violations.length ? `Hooks called after an early return (React #310):\n${rendered}` : '',
    ).toEqual([])
  })

  it('keeps EntitiesDashboard hooks before its loading/error/empty guards', () => {
    const source = fs.readFileSync(PAGE_FILE, 'utf-8')
    // The three filter hooks must be defined before the `if (loading)` guard.
    const loadingGuard = source.indexOf('if (loading) {', source.indexOf('function EntitiesDashboard'))
    const guard = loadingGuard
    expect(guard, 'EntitiesDashboard loading guard not found').toBeGreaterThan(-1)

    const componentStart = source.indexOf('function EntitiesDashboard')
    const body = source.slice(componentStart, guard)
    for (const hook of ['const uniqueSegments = useMemo', 'const uniqueTypes = useMemo', 'const filteredEntities = useMemo']) {
      expect(body, `${hook} must run before the first early return`).toContain(hook)
    }
  })

  it('detector catches the #310 pattern (self-test on a buggy fixture)', () => {
    const buggy = `
      "use client";
      import { useState, useMemo } from "react";
      function Widget() {
        const [loading, setLoading] = useState(true);
        const [items, setItems] = useState([]);
        if (loading) {
          return <div>loading</div>;
        }
        const filtered = useMemo(() => items.filter(Boolean), [items]);
        return <div>{filtered.length}</div>;
      }
    `
    const violations = findHooksAfterEarlyReturn('fixture.tsx', buggy)
    expect(violations).toHaveLength(1)
    expect(violations[0].component).toBe('Widget')
    expect(violations[0].hook).toBe('useMemo')
    expect(violations[0].line).toBe(10)
  })

  it('detector does not flag hooks that run before the guard', () => {
    const ok = `
      "use client";
      import { useState, useMemo } from "react";
      function Widget() {
        const [loading, setLoading] = useState(true);
        const [items, setItems] = useState([]);
        const filtered = useMemo(() => (items ?? []).filter(Boolean), [items]);
        if (loading) {
          return <div>loading</div>;
        }
        return <div>{filtered.length}</div>;
      }
    `
    expect(findHooksAfterEarlyReturn('fixture.tsx', ok)).toEqual([])
  })
})
