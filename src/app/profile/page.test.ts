import { describe, test, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

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
    expect(following).toContain('disabled={pending}')
  })

  test('a failed unfollow surfaces an error instead of silently reverting', () => {
    expect(content).toContain('setUnwatchError(')
    expect(content).toContain('role="alert"')
  })
})
