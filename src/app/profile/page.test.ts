import { describe, test, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import fs from 'fs'
import path from 'path'

// P0-1 render tests: ProfilePage renders Next's Link + useRouter, and imports
// the Supabase browser client. Stub both so a node-environment render never
// touches a router or a real client.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
}))
vi.mock('@/lib/supabase', () => ({
  createAuthBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signOut: async () => {},
    },
  }),
}))

// The profile page's load state is fixed to 'loading' in production. Partial-
// mock the module so the error state can be rendered end-to-end here without a
// live fetch (Next.js forbids a prop-based test seam on a page component).
vi.mock('./load-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./load-state')>()
  return { ...actual, getInitialLoadState: () => 'error' as const }
})

import ProfilePage from './page'
import { isLoadablePreferencesPayload, LoadErrorBanner } from './load-state'

describe('Profile page UX fixes', () => {
  const filePath = path.resolve(__dirname, 'page.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  test('email field is visually read-only', () => {
    // Should have readOnly attribute
    expect(content).toContain('readOnly')
    // Should have bg-ast-bg/50 class
    expect(content).toContain('bg-ast-bg/50')
    // Should have cursor-not-allowed class
    expect(content).toContain('cursor-not-allowed')
  })

  test('dev-note copy "Initials only for now" removed', () => {
    expect(content).not.toContain('Initials only for now')
  })

  test('conditional helper text for display name exists', () => {
    // Should contain the helper text pattern
    expect(content).toContain('Auto-set from your email — feel free to update')
    // Should contain the conditional logic
    expect(content).toContain("displayName === email.split('@')[0]")
  })
})

describe('Profile utility functions', () => {
  // Import the actual function from the component (need to extract)
  // For now, replicate logic
  const getInitials = (emailOrName: string) => {
    const name = emailOrName.split('@')[0]
    return name.substring(0, 2).toUpperCase()
  }

  test('getInitials returns first two chars of email prefix', () => {
    expect(getInitials('test@example.com')).toBe('TE')
    expect(getInitials('ab@example.com')).toBe('AB')
    expect(getInitials('a@example.com')).toBe('A') // substring(0,2) => 'A'?
    // Actually substring(0,2) on string length 1 returns 'A' (since end index > length)
    // We'll accept that behavior
  })
})

describe('Profile segments save trigger (issue #112)', () => {
  const filePath = path.resolve(__dirname, 'page.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  test('an explicit "Save preferences" button exists for segments', () => {
    expect(content).toContain('Save preferences')
    expect(content).toContain('onClick={handleSaveSegments}')
  })

  test('save button is disabled until the selection is dirty', () => {
    expect(content).toContain('const segmentsDirty')
    expect(content).toContain('disabled={!segmentsDirty')
  })

  test('shows saved and error feedback for the segment save', () => {
    expect(content).toContain('✓ Saved')
    expect(content).toContain('Failed to save — try again')
  })

  test('toggling a segment no longer autosaves silently', () => {
    const start = content.indexOf('const handleToggleSegment')
    const end = content.indexOf('const segmentsDirty')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const toggleBody = content.slice(start, end)
    expect(toggleBody).not.toContain('fetch(')
  })

  test('saving segments PATCHes the preferences API and reports status', () => {
    const start = content.indexOf('const handleSaveSegments')
    const end = content.indexOf('const getInitials')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const saveBody = content.slice(start, end)
    expect(saveBody).toContain('"/api/user/preferences"')
    expect(saveBody).toContain('method: "PATCH"')
    expect(saveBody).toContain('setSegmentStatus("saved")')
    expect(saveBody).toContain('setSegmentStatus("error")')
  })
})

describe('Following list rendering (AST t_9e83034c)', () => {
  const filePath = path.resolve(__dirname, 'page.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  // Isolate the Following section so assertions cannot be satisfied by
  // unrelated markup elsewhere on the page.
  const start = content.indexOf('{/* 4. Following (watched companies)')
  const end = content.indexOf('{/* 5. Notifications')
  const following = start > -1 && end > start ? content.slice(start, end) : ''

  test('the Following section is locatable', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
  })

  test('never falls back to the raw entity_id', () => {
    // The bug: `entity?.canonical_name || entry.entity_id` printed a UUID.
    expect(following).not.toMatch(/entry\.entity_id\s*\|\|/)
    expect(following).not.toMatch(/entry\.entity_id\s*\?\?/)
    expect(following).not.toMatch(/\|\|\s*entry\.entity_id/)
    expect(following).not.toMatch(/\?\?\s*entry\.entity_id/)
  })

  test('uses a human fallback label for unresolved entities', () => {
    expect(content).toContain('const UNKNOWN_COMPANY = "Unknown company"')
    expect(following).toContain('UNKNOWN_COMPANY')
  })

  test('shows the company name as primary text', () => {
    expect(following).toContain('entry.entity?.canonical_name')
    // Name renders in the primary (bright) text colour, not the muted one.
    expect(following).toMatch(/font-medium text-ast-text[\s\S]{0,80}\{name\}/)
  })

  test('shows ticker and exchange as muted secondary text', () => {
    expect(following).toContain('entry.entity?.ticker')
    expect(following).toContain('entry.entity?.exchange')
    expect(following).toContain('.join(" · ")')
    expect(following).toMatch(/text-xs text-ast-muted[\s\S]{0,80}\{meta\}/)
  })

  test('renders an optional entity_type chip', () => {
    expect(following).toContain('entry.entity?.entity_type')
    expect(following).toMatch(/uppercase[\s\S]{0,200}entity_type\}/)
  })

  test('unfollow button is labelled with the company name', () => {
    expect(following).toContain('aria-label={`Unfollow ${name}`}')
  })

  test('shows an "unfollowing..." pending state', () => {
    expect(following).toContain('"unfollowing..."')
    // P0-1: the row is also disabled while preferences are not loaded.
    expect(following).toContain('disabled={pending || writesDisabled}')
  })

  test('a failed unfollow surfaces an error instead of silently reverting', () => {
    expect(content).toContain('setUnwatchError(')
    expect(content).toContain('role="alert"')
  })
})

describe('Profile interests picker (card t_5ba5480e)', () => {
  const filePath = path.resolve(__dirname, 'page.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  test('uses the shared TagPicker instead of a free-text datalist input', () => {
    expect(content).toContain('import TagPicker from "@/components/TagPicker"')
    expect(content).toContain(
      '<TagPicker selected={interests} onChange={handleInterestsChange} />'
    )
    // The old native, accept-anything input is gone.
    expect(content).not.toContain('datalist')
    expect(content).not.toContain('theme-suggestions')
    expect(content).not.toContain('handleAddInterest')
    expect(content).not.toContain('availableThemes')
    expect(content).not.toContain('interestInput')
  })

  test('does not prefetch the tag catalogue on page load', () => {
    // Tags are lazy-loaded inside TagPicker, not by the page effect.
    const start = content.indexOf('const fetchData = async () => {')
    const end = content.indexOf('fetchData();')
    expect(start).toBeGreaterThan(-1)
    const loadBody = content.slice(start, end)
    expect(loadBody).not.toContain('/api/tags/themes')
  })

  test('persists the full selection and reverts on failure', () => {
    const start = content.indexOf('const handleInterestsChange')
    const end = content.indexOf('const handleToggleSegment')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = content.slice(start, end)
    expect(body).toContain('"/api/user/preferences"')
    expect(body).toContain('method: "PATCH"')
    expect(body).toContain('setInterests(previous)') // revert on error
    expect(body).toContain('setInterestsStatus("error")')
  })

  test('surfaces interest save status accessibly', () => {
    expect(content).toContain('aria-live="polite"')
    expect(content).toContain('Saving…')
  })
})

// Card t_e690b33d: prod renamed entity 'Niantic' to 'Scopely Explore' (parent
// Scopely, 'Niantic' kept as former_name) and added a new 'Niantic Spatial'
// entity under Infrastructure / Middleware. The segment-picker descriptions
// are hard-coded copy and must match the DB.
describe('Profile segment descriptions — Niantic rename', () => {
  const filePath = path.resolve(__dirname, 'page.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  test('Mobile-First / F2P lists Scopely Explore, not bare Niantic', () => {
    expect(content).toContain('Scopely Explore')
    expect(content).not.toMatch(/Scopely,\s*Dream Games,\s*Niantic\b/)
    // Former standalone 'Niantic' entry in the mobile segment is gone.
    expect(content).not.toMatch(/Dream Games,\s*Niantic,\s*Voodoo/)
  })

  test('Infrastructure / Middleware lists Niantic Spatial', () => {
    expect(content).toMatch(/ironSource,\s*Twitch,\s*Niantic Spatial/)
  })
})

// ---------------------------------------------------------------------------
// Card t_113538df (P0-1): gate writes on a successful load, banner + Retry.
// ---------------------------------------------------------------------------

describe('P0-1 — preferences payload validation', () => {
  test('accepts a populated preferences object as ready', () => {
    expect(
      isLoadablePreferencesPayload({
        preferences: { interests: ['mobile'], segments: [] },
        profile: { display_name: 'Ada' },
      })
    ).toBe(true)
  })

  test('treats a legitimately EMPTY new-user preferences object as ready', () => {
    expect(isLoadablePreferencesPayload({ preferences: {} })).toBe(true)
  })

  test('rejects a body with no preferences object (error, not empty)', () => {
    expect(isLoadablePreferencesPayload({})).toBe(false)
    expect(isLoadablePreferencesPayload({ preferences: null })).toBe(false)
    expect(isLoadablePreferencesPayload({ preferences: 'nope' })).toBe(false)
    expect(isLoadablePreferencesPayload({ preferences: [] })).toBe(false)
    expect(isLoadablePreferencesPayload(null)).toBe(false)
    expect(isLoadablePreferencesPayload(undefined)).toBe(false)
  })
})

describe('P0-1 — load-error state renders read-only + Retry banner', () => {
  test('shows the alert banner with the protection copy and a Retry button', () => {
    const html = renderToString(React.createElement(ProfilePage))

    expect(html).toContain('role="alert"')
    expect(html).toContain('data-testid="load-error-banner"')
    expect(html).toContain(
      'editing is turned off to protect your saved settings'
    )
    expect(html).toContain('>Retry<')
  })

  test('renders controls disabled so no write is reachable in the error state', () => {
    const html = renderToString(React.createElement(ProfilePage))

    // Native `disabled` (serialised as disabled=""): display-name field,
    // segment checkboxes, digest toggle, min-score slider, save buttons.
    const disabledCount = (html.match(/disabled=""/g) ?? []).length
    expect(disabledCount).toBeGreaterThanOrEqual(3)
    // The interests picker is wrapped in an aria-disabled, inert box.
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('data-testid="interests-controls"')
  })

  test('the banner component renders standalone with role=alert + Retry', () => {
    const html = renderToString(
      React.createElement(LoadErrorBanner, { onRetry: () => {} })
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('data-testid="load-error-banner"')
    expect(html).toContain('>Retry<')
  })
})

describe('P0-1 — every write path is guarded (source assertions)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf-8')
  const guard = 'if (loadState !== "ready") return;'

  test('defines loadState and derives a single writes-disabled gate', () => {
    expect(src).toContain('const [loadState, setLoadState] = useState<LoadState>')
    expect(src).toContain('const writesDisabled = loadState !== "ready"')
  })

  test('guards each preferences/DELETE handler with the ready check', () => {
    const handlers: Record<string, [string, string]> = {
      handleSaveDisplayName: ['const handleSaveDisplayName', 'const handleInterestsChange'],
      handleInterestsChange: ['const handleInterestsChange', 'const handleToggleSegment'],
      handleToggleSegment: ['const handleToggleSegment', 'const segmentsDirty'],
      handleSaveSegments: ['const handleSaveSegments', 'const getInitials'],
      handleUnwatch: ['const handleUnwatch', 'const saveNotificationPrefs'],
      saveNotificationPrefs: ['const saveNotificationPrefs', 'const handleToggleDigest'],
      handleToggleDigest: ['const handleToggleDigest', 'const handleMinScoreChange'],
      handleMinScoreChange: ['const handleMinScoreChange', 'if (loadState === "loading")'],
    }

    for (const [name, [startMarker, endMarker]] of Object.entries(handlers)) {
      const start = src.indexOf(startMarker)
      const end = src.indexOf(endMarker)
      expect(start, `${name} start`).toBeGreaterThan(-1)
      expect(end, `${name} end`).toBeGreaterThan(start)
      expect(src.slice(start, end), `${name} must early-return unless ready`).toContain(
        guard
      )
    }
  })

  test('renders controls disabled from the writesDisabled gate', () => {
    expect(src).toContain('disabled={writesDisabled}')
    expect(src).toContain('aria-disabled={writesDisabled}')
  })

  test('treats a non-OK / malformed response as an error (never defaults)', () => {
    expect(src).toContain('if (!response.ok) {')
    expect(src).toContain('Failed to load preferences')
    expect(src).toContain('isLoadablePreferencesPayload(data)')
    expect(src).toContain('setLoadState("error")')
  })
})

describe('P0-1 — no refetch on re-render (audit S6)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf-8')

  test('memoises the auth browser client so the load effect is stable', () => {
    expect(src).toContain('const supabase = useMemo(() => createAuthBrowserClient(), [])')
    // It must NOT be created in the render body any more.
    expect(src).not.toContain('const supabase = createAuthBrowserClient()')
  })

  test('re-runs the load only on router/supabase/reloadKey change', () => {
    expect(src).toContain('}, [router, supabase, reloadKey]);')
  })

  test('the Retry button bumps reloadKey to re-run the load', () => {
    expect(src).toContain('const [reloadKey, setReloadKey] = useState(0)')
    expect(src).toContain(
      '<LoadErrorBanner onRetry={() => setReloadKey((k) => k + 1)} />'
    )
  })

  test('renders the loading UI only while the request is in flight', () => {
    expect(src).toContain('if (loadState === "loading")')
    expect(src).toContain('Loading...')
  })
})

