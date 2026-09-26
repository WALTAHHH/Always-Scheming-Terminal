import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'fs';

// Mock the supabase client module (required for component import)
vi.mock('@/lib/supabase', () => ({
  createAuthBrowserClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  })),
}));

// Import the component after mocking (to avoid import errors)
import LoginPage from '../login/page';

describe('Phase 6 invite-only signup gate', () => {
  const source = readFileSync('src/app/auth/login/page.tsx', 'utf-8');

  test('sign-up tab label should be "Request access"', () => {
    // Check that the tab button text is "Request access"
    const hasRequestAccess = source.includes('Request access');
    expect(hasRequestAccess).toBe(true);
  });

  test('preflight check queries allowed_emails table for email', () => {
    // Check that the source contains the allowed_emails query pattern
    const hasAllowedEmailsQuery = source.includes('allowed_emails') &&
      source.includes('.from(\'allowed_emails\')') ||
      source.includes('.from("allowed_emails")') ||
      source.includes('.from(`allowed_emails`)');
    expect(hasAllowedEmailsQuery).toBe(true);
  });
});