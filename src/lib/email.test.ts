import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEmailConfig,
  isEmailConfigured,
  getDigestFooterAddress,
  getSiteUrl,
  generateDigestUnsubToken,
  buildDigestUnsubUrl,
  buildDigestUnsubHeaders,
  redactEmail,
  sendEmail,
  renderDigestSubject,
  renderDigestText,
  renderDigestHtml,
  groupDigestAlerts,
  type DigestAlert,
  type DigestRenderInput,
} from './email';
import { createHmac, randomBytes } from 'crypto';

// Keep the real `createHash` (used by `redactEmail` to produce a deterministic
// SHA-256 token); only stub the sources of randomness/HMAC used elsewhere.
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return { ...actual, createHmac: vi.fn(), randomBytes: vi.fn() };
});

const mockCreateHmac = vi.mocked(createHmac);
const mockRandomBytes = vi.mocked(randomBytes);

describe('email config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('getEmailConfig returns null when RESEND_API_KEY missing', () => {
    process.env.RESEND_API_KEY = '';
    process.env.DIGEST_FROM = 'alerts@example.com';
    expect(getEmailConfig()).toBeNull();
  });

  it('getEmailConfig returns null when DIGEST_FROM missing', () => {
    process.env.RESEND_API_KEY = 're_123';
    process.env.DIGEST_FROM = '';
    expect(getEmailConfig()).toBeNull();
  });

  it('getEmailConfig returns config when both present', () => {
    process.env.RESEND_API_KEY = 're_123';
    process.env.DIGEST_FROM = 'alerts@example.com';
    expect(getEmailConfig()).toEqual({ apiKey: 're_123', from: 'alerts@example.com' });
  });

  it('isEmailConfigured true when config present', () => {
    process.env.RESEND_API_KEY = 're_123';
    process.env.DIGEST_FROM = 'alerts@example.com';
    expect(isEmailConfigured()).toBe(true);
  });

  it('isEmailConfigured false when config missing', () => {
    process.env.RESEND_API_KEY = '';
    expect(isEmailConfigured()).toBe(false);
  });

  it('getDigestFooterAddress returns empty string when unset', () => {
    delete process.env.DIGEST_FOOTER_ADDRESS;
    expect(getDigestFooterAddress()).toBe('');
  });

  it('getDigestFooterAddress returns trimmed value', () => {
    process.env.DIGEST_FOOTER_ADDRESS = '  123 Main St   ';
    expect(getDigestFooterAddress()).toBe('123 Main St');
  });

  it('getSiteUrl defaults to production origin', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBe('https://terminal.always-scheming.com');
  });

  it('getSiteUrl strips trailing slash', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://localhost:3000/';
    expect(getSiteUrl()).toBe('https://localhost:3000');
  });
});

describe('unsubscribe token helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGEST_UNSUB_SECRET = undefined;
    // reset env to original to avoid pollution from other tests
    process.env.NEXT_PUBLIC_SITE_URL = 'https://terminal.always-scheming.com';
  });

  it('generates deterministic HMAC token when secret set', () => {
    process.env.DIGEST_UNSUB_SECRET = 'my-secret';
    const mockDigest = vi.fn().mockReturnValue('abc123');
    const mockUpdate = vi.fn().mockReturnValue({ digest: mockDigest });
    mockCreateHmac.mockReturnValueOnce({ update: mockUpdate } as any);
    const token = generateDigestUnsubToken('user-1');
    expect(mockCreateHmac).toHaveBeenCalledWith('sha256', 'my-secret');
    expect(mockUpdate).toHaveBeenCalledWith('user-1');
    expect(mockDigest).toHaveBeenCalledWith('hex');
    expect(token).toBe('abc123');
  });

  it('generates random token when secret unset', () => {
    const hex = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    mockRandomBytes.mockReturnValueOnce(Buffer.from(hex, 'hex'));
    const token = generateDigestUnsubToken('user-1');
    expect(mockRandomBytes).toHaveBeenCalledWith(32);
    expect(token).toBe(hex);
  });

  it('buildDigestUnsubUrl constructs correct URL', () => {
    expect(buildDigestUnsubUrl('token123')).toBe('https://terminal.always-scheming.com/unsubscribe?token=token123');
    expect(buildDigestUnsubUrl('token123', 'https://example.com')).toBe('https://example.com/unsubscribe?token=token123');
  });

  it('buildDigestUnsubHeaders includes RFC 8058 headers', () => {
    const headers = buildDigestUnsubHeaders('token123', 'https://example.com');
    expect(headers).toEqual({
      'List-Unsubscribe': '<https://example.com/unsubscribe?token=token123>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});

describe('redactEmail', () => {
  it('replaces the local part with a deterministic 8-hex sha256 prefix and keeps the domain', () => {
    const out = redactEmail('alice@example.com');
    expect(out).toMatch(/^[0-9a-f]{8}@example\.com$/);
    // deterministic across calls
    expect(redactEmail('alice@example.com')).toBe(out);
  });

  it('stays distinguishable between recipients and domains', () => {
    expect(redactEmail('alice@example.com')).not.toBe(redactEmail('bob@example.com'));
    expect(redactEmail('alice@example.com')).not.toBe(redactEmail('alice@other.com'));
  });

  it('never leaks the local part and lowercases the domain', () => {
    const out = redactEmail('Alice.Smith@Example.COM');
    expect(out).not.toContain('alice');
    expect(out).not.toContain('smith');
    expect(out).toMatch(/^[0-9a-f]{8}@example\.com$/);
  });

  it('falls back to the bare hash for malformed addresses', () => {
    expect(redactEmail('not-an-email')).toMatch(/^[0-9a-f]{8}$/);
    expect(redactEmail('trailing@')).toMatch(/^[0-9a-f]{8}$/);
    expect(redactEmail('')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('sendEmail', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    global.fetch = mockFetch;
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_123';
    process.env.DIGEST_FROM = 'alerts@example.com';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns skipped when Resend not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Hi</p>' });
    expect(result).toEqual({ ok: false, skipped: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns ok true with id on success', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'msg_123' }),
    };
    mockFetch.mockResolvedValueOnce(mockResponse);
    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Hi</p>',
      text: 'Hi',
      headers: { 'X-Custom': 'value' },
      replyTo: 'reply@example.com',
    });
    expect(mockFetch).toHaveBeenCalledWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer re_123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'alerts@example.com',
        to: ['test@example.com'],
        subject: 'Test',
        html: '<p>Hi</p>',
        text: 'Hi',
        headers: { 'X-Custom': 'value' },
        reply_to: 'reply@example.com',
      }),
    });
    expect(result).toEqual({ ok: true, id: 'msg_123' });
  });

  it('returns ok false on non-2xx response', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Bad request'),
    };
    mockFetch.mockResolvedValueOnce(mockResponse);
    const result = await sendEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Hi</p>' });
    expect(result).toEqual({ ok: false, error: 'resend_400' });
  });

  it('returns ok false on fetch exception', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await sendEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Hi</p>' });
    expect(result).toEqual({ ok: false, error: 'Network error' });
  });

  it('redacts the recipient in console.warn when Resend is not configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.RESEND_API_KEY;
    await sendEmail({ to: 'secret.user@example.com', subject: 'Test', html: '<p>Hi</p>' });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).not.toContain('secret.user@example.com');
    expect(logged).toContain(redactEmail('secret.user@example.com'));
    warn.mockRestore();
  });

  it('redacts the recipient in console.error when Resend rejects the send', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('boom'),
    });
    await sendEmail({ to: 'secret.user@example.com', subject: 'Test', html: '<p>Hi</p>' });
    expect(error).toHaveBeenCalledTimes(1);
    const logged = String(error.mock.calls[0][0]);
    expect(logged).not.toContain('secret.user@example.com');
    expect(logged).toContain(redactEmail('secret.user@example.com'));
    error.mockRestore();
  });

  it('redacts the recipient in console.error when the send throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    await sendEmail({ to: 'secret.user@example.com', subject: 'Test', html: '<p>Hi</p>' });
    expect(error).toHaveBeenCalledTimes(1);
    const logged = String(error.mock.calls[0][0]);
    expect(logged).not.toContain('secret.user@example.com');
    expect(logged).toContain(redactEmail('secret.user@example.com'));
    error.mockRestore();
  });

  it('uses injected config and fetch', async () => {
    const mockFetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'injected' }),
    });
    const result = await sendEmail(
      { to: 'test@example.com', subject: 'Test', html: '<p>Hi</p>' },
      { config: { apiKey: 'custom', from: 'custom@example.com' }, fetchImpl: mockFetchImpl },
    );
    expect(mockFetchImpl).toHaveBeenCalledWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer custom',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'custom@example.com',
        to: ['test@example.com'],
        subject: 'Test',
        html: '<p>Hi</p>',
        text: undefined,
        headers: undefined,
        reply_to: undefined,
      }),
    });
    expect(result).toEqual({ ok: true, id: 'injected' });
  });
});

describe('digest rendering', () => {
  const sampleAlert: DigestAlert = {
    entityName: 'Apple Inc.',
    signalType: 'earnings',
    summary: 'Q4 revenue beat expectations',
    score: 0.85,
    url: 'https://example.com/article',
    createdAt: '2026-11-10T12:00:00Z',
  };

  const sampleAlert2: DigestAlert = {
    entityName: 'Microsoft',
    signalType: 'acquisition',
    summary: 'Acquired startup',
    score: 0.92,
    url: 'https://example.com/article2',
    createdAt: '2026-11-09T10:00:00Z',
  };

  it('groupDigestAlerts groups by entity and sorts', () => {
    const alerts = [sampleAlert2, sampleAlert];
    const groups = groupDigestAlerts(alerts);
    expect(groups).toHaveLength(2);
    expect(groups[0][0]).toBe('Apple Inc.');
    expect(groups[1][0]).toBe('Microsoft');
    // newest first within group
    expect(groups[0][1][0].summary).toBe('Q4 revenue beat expectations');
  });

  it('groupDigestAlerts filters out alerts missing entityName', () => {
    const invalidAlert = { ...sampleAlert, entityName: '' };
    const groups = groupDigestAlerts([invalidAlert]);
    expect(groups).toHaveLength(0);
  });

  it('renderDigestSubject pluralizes', () => {
    expect(renderDigestSubject(0)).toBe('Weekly AST watchlist digest — 0 updates');
    expect(renderDigestSubject(1)).toBe('Weekly AST watchlist digest — 1 update');
    expect(renderDigestSubject(5)).toBe('Weekly AST watchlist digest — 5 updates');
  });

  it('renderDigestText includes footer address when present', () => {
    const input: DigestRenderInput = {
      alerts: [sampleAlert],
      unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
      footerAddress: '123 Main St, City',
      siteUrl: 'https://example.com',
    };
    const text = renderDigestText(input);
    expect(text).toContain('123 Main St, City');
    expect(text).toContain('Unsubscribe: https://example.com/unsubscribe?token=xyz');
    expect(text).toContain('Manage your watchlist: https://example.com/profile');
  });

  it('renderDigestText omits footer address when empty', () => {
    const input: DigestRenderInput = {
      alerts: [sampleAlert],
      unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
      footerAddress: '',
      siteUrl: 'https://example.com',
    };
    const text = renderDigestText(input);
    expect(text).not.toContain('123 Main St');
    expect(text).toContain('Unsubscribe:');
  });

  it('renderDigestHtml includes footer address when present', () => {
    const input: DigestRenderInput = {
      alerts: [sampleAlert],
      unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
      footerAddress: '123 Main St, City',
      siteUrl: 'https://example.com',
    };
    const html = renderDigestHtml(input);
    expect(html).toContain('123 Main St, City');
    expect(html).toContain('<a href="https://example.com/unsubscribe?token=xyz"');
  });

  it('renderDigestHtml omits footer address when empty', () => {
    const input: DigestRenderInput = {
      alerts: [sampleAlert],
      unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
      footerAddress: '',
      siteUrl: 'https://example.com',
    };
    const html = renderDigestHtml(input);
    expect(html).not.toContain('123 Main St');
    expect(html).toContain('<a href="https://example.com/unsubscribe?token=xyz"');
  });

  it('renderDigestHtml escapes HTML entities', () => {
    const alertWithHtml: DigestAlert = {
      entityName: 'Company & Co.',
      signalType: 'acquisition',
      summary: 'Buy & sell > 100',
      score: 0.5,
      url: 'https://example.com/?q="test"',
      createdAt: null,
    };
    const input: DigestRenderInput = {
      alerts: [alertWithHtml],
      unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
      footerAddress: '',
      siteUrl: 'https://example.com',
    };
    const html = renderDigestHtml(input);
    expect(html).toContain('Company &amp; Co.');
    expect(html).toContain('Buy &amp; sell &gt; 100');
    expect(html).toContain('https://example.com/?q=&quot;test&quot;');
  });
});