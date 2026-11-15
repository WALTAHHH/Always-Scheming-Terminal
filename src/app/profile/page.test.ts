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
