/**
 * Regression guard for the Admin page load-time work (card t_3b9101c5).
 *
 * Measurements showed the first paint of /admin blocked on GET /api/sources
 * (~1 s warm, ~6 s cold) even though the default Pipeline tab renders neither
 * sources nor logs, and that /api/admin/entities was requested more than once
 * per session. These are source-assertion tests: rendering the real client
 * component would need jsdom + a React client renderer, which this project does
 * not depend on (same convention as page.hooks.test.ts).
 *
 * If someone re-adds an eager fetchSources()/fetchLogs() to the mount effect or
 * bypasses the shared entities cache, these tests fail.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const PAGE_FILE = path.resolve(__dirname, 'page.tsx')
const source = fs.readFileSync(PAGE_FILE, 'utf-8')

/** Body of the AdminPage component (from its declaration to the next top-level function). */
function adminPageBody(): string {
  const start = source.indexOf('export default function AdminPage()')
  expect(start, 'AdminPage component not found').toBeGreaterThan(-1)
  const end = source.indexOf('function handleSort', start)
  expect(end, 'end of AdminPage mount effects not found').toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('admin/page.tsx — lazy, per-tab data loading', () => {
  it('does not fetch sources/logs eagerly on mount', () => {
    const body = adminPageBody()
    // The only effect that runs on mount must be the admin-access check.
    expect(body).not.toMatch(/\.catch\(\(\) => \{\}\);\s*\n\s*fetchSources\(\)/)
    expect(body).not.toMatch(/\.catch\(\(\) => \{\}\);\s*\n\s*fetchLogs\(\)/)
    // The access-check effect must not depend on the data fetchers.
    expect(body).toContain('}, [router]);')
  })

  it('fetches sources/logs only for the tabs that render them', () => {
    const body = adminPageBody()
    expect(body).toContain('if ((tab === "sources" || tab === "health") && !sourcesLoaded)')
    expect(body).toContain('if (tab === "health" && !logsLoaded)')
  })

  it('renders the Pipeline tab without waiting for sources', () => {
    // The old full-page gate was `loading ? <AdminSkeleton /> : ...`.
    expect(source).not.toContain('{loading ? (\n          <AdminSkeleton />')
    expect(source).toContain('!sourcesLoaded ? (\n            <AdminSkeleton />')
  })
})

describe('admin/page.tsx — shared /api/admin/entities cache', () => {
  it('has exactly one raw fetch of the entities endpoint', () => {
    const hits = source.match(/fetch\("\/api\/admin\/entities"\)/g) ?? []
    expect(hits).toHaveLength(1)
  })

  it('routes both consumers through the cached helper', () => {
    expect(source).toContain('const data = await fetchEntitiesCached();')
    expect(source).toContain('await fetchEntitiesCached()')
    expect(source).toMatch(/ENTITIES_CACHE_TTL_MS = 60_000/)
  })
})
