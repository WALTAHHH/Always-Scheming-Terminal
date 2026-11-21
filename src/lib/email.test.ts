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
  sortDigestAlerts,
  groupSortedDigestAlerts,
  digestItemMetaLine,
  digestHeroTitle,
  renderDigestPreheader,
  clampHeadline,
  DIGEST_HEADLINE_MAX,
  DIGEST_PER_COMPANY_MAX,
  DIGEST_TOTAL_MAX,
  DIGEST_VARIANT_A_MAX,
  safeDigestUrl,
  buildDigestCompanyUrl,
  formatDigestDate,
  digestMetaLine,
  digestRelevance,
  buildSampleDigestAlerts,
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
    expect(result).toEqual({ ok: false, error: 'resend_400', status: 400, detail: 'Bad request' });
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

describe('digest URL scheme allowlist', () => {
  const inputWithUrl = (url: string): DigestRenderInput => ({
    alerts: [
      {
        entityName: 'Acme',
        signalType: 'earnings',
        summary: 'Acme beats estimates',
        score: 0.9,
        url,
        createdAt: '2026-11-10T12:00:00Z',
      },
    ],
    unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
    footerAddress: '',
    siteUrl: 'https://example.com',
  });

  const hostileUrls = [
    'javascript:alert(document.domain)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)  ',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'tel:+15555550100',
    '//evil.example/article',
    '/relative/path',
    'not a url',
  ];

  it('safeDigestUrl accepts absolute http and https URLs', () => {
    expect(safeDigestUrl('https://example.com/article')).toBe('https://example.com/article');
    expect(safeDigestUrl('http://example.com/article?a=1#b')).toBe(
      'http://example.com/article?a=1#b',
    );
    expect(safeDigestUrl('HTTPS://Example.com/Article')).toBe('HTTPS://Example.com/Article');
  });

  it('safeDigestUrl rejects disallowed schemes and non-absolute values', () => {
    for (const url of hostileUrls) {
      expect(safeDigestUrl(url), url).toBeNull();
    }
    expect(safeDigestUrl('')).toBeNull();
    expect(safeDigestUrl('   ')).toBeNull();
    expect(safeDigestUrl(null)).toBeNull();
    expect(safeDigestUrl(undefined)).toBeNull();
    expect(safeDigestUrl(42)).toBeNull();
    expect(safeDigestUrl({ toString: () => 'https://example.com' })).toBeNull();
  });

  it.each(hostileUrls)('renderDigestHtml drops the link for %j', (url) => {
    const html = renderDigestHtml(inputWithUrl(url));
    const lowered = html.toLowerCase();
    for (const marker of [
      'javascript:',
      'data:text/html',
      'vbscript:',
      'file:///etc/passwd',
      'tel:+1555',
      'evil.example',
      '/relative/path',
    ]) {
      expect(lowered).not.toContain(marker);
    }
    // Quiet fallback: the headline survives as plain text, with no anchor and no
    // "(link unavailable)" note leaking an internal failure to the reader.
    expect(html).toContain('Acme beats estimates');
    expect(html).not.toContain('(link unavailable)');
    expect(html).toContain('Unsubscribe');
  });

  it('renderDigestText omits a disallowed URL but keeps the summary and footer', () => {
    const text = renderDigestText(inputWithUrl('javascript:alert(1)'));
    expect(text).toContain('Acme beats estimates');
    expect(text).not.toContain('javascript:');
    expect(text).toContain('Unsubscribe: https://example.com/unsubscribe?token=xyz');
  });

  it('renderDigestText keeps allowed article URLs', () => {
    const text = renderDigestText(inputWithUrl('https://example.com/story?id=1'));
    expect(text).toContain('https://example.com/story?id=1');
  });

  it('renderDigestHtml keeps allowed links and still escapes them', () => {
    const html = renderDigestHtml(inputWithUrl('https://example.com/?q="x"&y=<z>'));
    expect(html).toContain('href="https://example.com/?q=&quot;x&quot;&amp;y=&lt;z&gt;"');
    expect(html).not.toContain('(link unavailable)');
  });

  it('a mixed digest renders the valid link and degrades only the hostile one', () => {
    const input: DigestRenderInput = {
      alerts: [
        {
          entityName: 'Acme',
          signalType: 'earnings',
          summary: 'Good article',
          score: 0.9,
          url: 'https://example.com/good',
          createdAt: '2026-11-10T12:00:00Z',
        },
        {
          entityName: 'Acme',
          signalType: 'news',
          summary: 'Hostile article',
          score: 0.8,
          url: 'javascript:alert(1)',
          createdAt: '2026-11-09T12:00:00Z',
        },
      ],
      unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
      footerAddress: '',
      siteUrl: 'https://example.com',
    };
    const html = renderDigestHtml(input);
    expect(html).toContain('href="https://example.com/good"');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Hostile article');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('(link unavailable)');
  });
});

describe('digest item deep links + source/date meta line', () => {
  const alert: DigestAlert = {
    entityName: 'Acme Games',
    signalType: 'acquisition',
    summary: 'Acme Games acquires Pixel Forge.',
    score: 0.93,
    url: 'https://news.example.com/story',
    createdAt: '2026-11-17T09:00:00.000Z',
    sourceName: 'The Game Business',
  };

  const input: DigestRenderInput = {
    alerts: [alert],
    unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
    footerAddress: '',
    siteUrl: 'https://example.com',
  };

  it('buildDigestCompanyUrl encodes the entity name and pins the scheme to https', () => {
    expect(buildDigestCompanyUrl('Acme Games', 'https://example.com')).toBe(
      'https://example.com/?company=Acme%20Games',
    );
    // trailing slash on the origin is normalised away
    expect(buildDigestCompanyUrl('Acme Games', 'https://example.com/')).toBe(
      'https://example.com/?company=Acme%20Games',
    );
    // reserved characters are URI-encoded, not emitted raw
    expect(buildDigestCompanyUrl('A & B/C?"#<x>', 'https://example.com')).toBe(
      'https://example.com/?company=A%20%26%20B%2FC%3F%22%23%3Cx%3E',
    );
    // a non-https origin yields no link rather than an insecure one
    expect(buildDigestCompanyUrl('Acme Games', 'http://example.com')).toBeNull();
    expect(buildDigestCompanyUrl('Acme Games', 'ftp://example.com')).toBeNull();
  });

  it('formatDigestDate renders a stable UTC short date', () => {
    expect(formatDigestDate('2026-11-17T23:30:00.000Z')).toBe('Nov 17');
    expect(formatDigestDate('2026-01-02T00:00:00.000Z')).toBe('Jan 2');
    expect(formatDigestDate(null)).toBeNull();
    expect(formatDigestDate('not-a-date')).toBeNull();
  });

  it('digestMetaLine joins source and date, tolerating a missing half', () => {
    expect(digestMetaLine(alert)).toBe('The Game Business · Nov 17');
    expect(digestMetaLine({ ...alert, sourceName: null })).toBe('Nov 17');
    expect(digestMetaLine({ ...alert, createdAt: null })).toBe('The Game Business');
    expect(digestMetaLine({ ...alert, sourceName: '  ', createdAt: null })).toBeNull();
  });

  it('links the company heading to the drawer deep link', () => {
    const html = renderDigestHtml(input);
    expect(html).toContain(
      '<a href="https://example.com/?company=Acme%20Games" class="c-txt" style="color:#d4d4d4;text-decoration:underline;">Acme Games</a>',
    );
  });

  it('links the summary to the article URL in a new tab', () => {
    const html = renderDigestHtml(input);
    expect(html).toContain(
      'href="https://news.example.com/story" target="_blank" rel="noopener noreferrer"',
    );
  });

  it('renders the muted relevance · source · date meta line', () => {
    const html = renderDigestHtml(input);
    expect(html).toContain('The Game Business · Nov 17');
    expect(html).toContain('font-size:12px;line-height:16px;color:#9ca3af');
    expect(html).toContain('Relevance');
    expect(html).toContain('>93</span>');
  });

  it('escapes a hostile entity name inside the deep link and the heading', () => {
    const html = renderDigestHtml({
      ...input,
      alerts: [{ ...alert, entityName: '<img src=x onerror=alert(1)>' }],
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror=alert(1)>');
    // raw angle brackets are percent-encoded in the href, escaped in the text
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('renders the deep link and meta line in the text part too', () => {
    const text = renderDigestText(input);
    expect(text).toContain('https://example.com/?company=Acme%20Games');
    expect(text).toContain('The Game Business · Nov 17');
    expect(text).toContain('https://news.example.com/story');
  });

  it('sample alerts carry a source/date meta line and point their links at the site root', () => {
    const samples = buildSampleDigestAlerts('https://terminal.example.com/');
    expect(samples).toHaveLength(3);
    for (const s of samples) {
      expect(s.sourceName).toBeTruthy();
      expect(s.url.startsWith('https://terminal.example.com/')).toBe(true);
      expect(digestMetaLine(s)).toMatch(/· Nov \d+/);
    }
    expect(digestMetaLine(samples[0])).toBe('The Game Business · Nov 17');
  });

  it('sample alerts carry ticker/isPublic (one public, one private) and a numeric relevance', () => {
    const samples = buildSampleDigestAlerts('https://terminal.example.com');
    expect(samples.length).toBeGreaterThanOrEqual(3);

    // Every sample carries the reader-facing relevance as a 0-100 integer.
    for (const s of samples) {
      expect(Number.isInteger(s.relevance)).toBe(true);
      expect(s.relevance).toBe(Math.round(s.score * 100));
    }

    // At least one public company with a ticker, and at least one private.
    const publicWithTicker = samples.filter(
      (s) => s.isPublic === true && typeof s.ticker === 'string' && s.ticker.length > 0,
    );
    const privateCos = samples.filter((s) => s.isPublic === false);
    expect(publicWithTicker.length).toBeGreaterThanOrEqual(1);
    expect(privateCos.length).toBeGreaterThanOrEqual(1);

    // Mixed signal types across the sample week.
    expect(new Set(samples.map((s) => s.signalType)).size).toBeGreaterThanOrEqual(2);

    // Content title + publication date are present so card 2 can render the
    // headline and the "Source · Mon DD" meta line without recomputing them.
    for (const s of samples) {
      expect(s.title).toBeTruthy();
      expect(s.publishedAt).toBeTruthy();
      expect(formatDigestDate(s.publishedAt)).not.toBeNull();
    }
  });
});

describe('digestRelevance', () => {
  it('rounds score*100 to a 0-100 integer', () => {
    expect(digestRelevance(0.93)).toBe(93);
    expect(digestRelevance(0.88)).toBe(88);
    expect(digestRelevance(0.005)).toBe(1);
    expect(digestRelevance(0)).toBe(0);
    expect(digestRelevance(1)).toBe(100);
  });

  it('clamps out-of-range and non-finite scores', () => {
    expect(digestRelevance(1.4)).toBe(100);
    expect(digestRelevance(-0.2)).toBe(0);
    expect(digestRelevance(Number.NaN)).toBe(0);
    expect(digestRelevance(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('digest redesign v2 — layout, truncation, escaping', () => {
  const mk = (over: Partial<DigestAlert> & { entityName: string }): DigestAlert => ({
    signalType: 'acquisition',
    summary: 'A headline',
    score: 0.9,
    url: 'https://example.com/a',
    createdAt: '2026-11-17T09:00:00.000Z',
    sourceName: 'The Verge',
    ...over,
  });

  const inputOf = (alerts: DigestAlert[]): DigestRenderInput => ({
    alerts,
    unsubscribeUrl: 'https://example.com/unsubscribe?token=xyz',
    footerAddress: '',
    siteUrl: 'https://example.com',
  });

  // Ten stories across five companies, mixed signal types, mirroring the
  // 10-story Variant B mockup.
  const tenStories = (): DigestAlert[] => [
    mk({ entityName: 'Acme Games', signalType: 'acquisition', relevance: 93, summary: 'Acme Games acquires Pixel Forge for $120M in a cash-and-stock deal.', createdAt: '2026-11-17T09:00:00.000Z', sourceName: 'The Game Business', isPublic: false }),
    mk({ entityName: 'Northstar Interactive', signalType: 'fundraising', relevance: 88, summary: 'Northstar Interactive raises a $45M Series B led by Horizon Ventures.', createdAt: '2026-11-16T09:00:00.000Z', sourceName: 'PocketGamer.biz', isPublic: false }),
    mk({ entityName: 'Acme Games', signalType: 'product_launch', relevance: 84, summary: 'Acme Games opens its Pixel Forge studio pipeline with a first-party title slated for spring 2027 and more to follow.', createdAt: '2026-11-18T09:00:00.000Z', sourceName: 'GamesIndustry.biz', isPublic: false }),
    mk({ entityName: 'Cobalt Studios', signalType: 'layoffs', relevance: 81, summary: 'Cobalt Studios cuts 80 roles as its live-service project winds down.', createdAt: '2026-11-15T09:00:00.000Z', sourceName: 'GamesIndustry.biz', isPublic: false }),
    mk({ entityName: 'Kestrel Games', signalType: 'earnings', relevance: 79, summary: 'Kestrel Games reports Q3 bookings up 12% year on year and raises full-year guidance.', createdAt: '2026-11-17T10:00:00.000Z', sourceName: 'Business Wire', ticker: 'KSTR', isPublic: true }),
    mk({ entityName: 'Acme Games', signalType: 'leadership', relevance: 71, summary: 'Acme Games names a new CFO from Vector Entertainment.', createdAt: '2026-11-14T09:00:00.000Z', sourceName: 'The Game Business', isPublic: false }),
    mk({ entityName: 'Acme Games', signalType: 'regulatory', relevance: 66, summary: 'Regulators open a review of Acme Games loot-box disclosures in two EU markets.', createdAt: '2026-11-13T09:00:00.000Z', sourceName: 'Eurogamer', isPublic: false }),
    mk({ entityName: 'Halcyon Digital', signalType: 'product_launch', relevance: 62, summary: 'Halcyon Digital ships cloud saves to its three top titles.', createdAt: '2026-11-10T09:00:00.000Z', sourceName: 'Pocket Gamer', isPublic: false }),
    mk({ entityName: 'Northstar Interactive', signalType: 'platform_change', relevance: 58, summary: 'Northstars storefront partner changes revenue-share terms for mid-size publishers from January.', createdAt: '2026-11-12T09:00:00.000Z', sourceName: 'PocketGamer.biz', isPublic: false }),
    mk({ entityName: 'Halcyon Digital', signalType: 'macro', relevance: 52, summary: 'Halcyon Digital flags currency headwinds in its European revenue outlook.', createdAt: '2026-11-11T09:00:00.000Z', sourceName: 'Financial Times', isPublic: false }),
  ];

  const noopenerCount = (html: string) => (html.match(/rel="noopener noreferrer"/g) ?? []).length;

  it('HTML snapshot — 3-story sample renders Variant A (grouped)', () => {
    const html = renderDigestHtml(inputOf(buildSampleDigestAlerts('https://example.com')));
    expect(html).not.toContain('RANKED BY RELEVANCE');
    expect(html).toMatchSnapshot();
  });

  it('HTML snapshot — 10-story sample renders Variant B (flat)', () => {
    const html = renderDigestHtml(inputOf(tenStories()));
    expect(html).toContain('RANKED BY RELEVANCE');
    expect(html).toMatchSnapshot();
  });

  it('selects Variant A at <= 8 stories and Variant B above 8', () => {
    const eight = Array.from({ length: DIGEST_VARIANT_A_MAX }, (_, i) =>
      mk({ entityName: `Co ${i}`, relevance: 90 - i, url: `https://example.com/${i}` }),
    );
    const nine = Array.from({ length: DIGEST_VARIANT_A_MAX + 1 }, (_, i) =>
      mk({ entityName: `Co ${i}`, relevance: 90 - i, url: `https://example.com/${i}` }),
    );
    expect(renderDigestHtml(inputOf(eight))).not.toContain('RANKED BY RELEVANCE');
    expect(renderDigestHtml(inputOf(nine))).toContain('RANKED BY RELEVANCE');
  });

  it('computes the hero line and the week label', () => {
    const html = renderDigestHtml(inputOf(buildSampleDigestAlerts('https://example.com')));
    expect(html).toContain('3 updates across 3 companies this week');
    expect(html).toContain('Week of Nov 16 &middot; sorted by relevance');
    expect(digestHeroTitle(1, 1)).toBe('1 update across 1 company this week');
  });

  it('orders stories by relevance desc, then newest, then company name', () => {
    const alerts = [
      mk({ entityName: 'Zeta', relevance: 50, createdAt: '2026-01-01T00:00:00.000Z' }),
      mk({ entityName: 'Alpha', relevance: 50, createdAt: '2026-01-02T00:00:00.000Z' }),
      mk({ entityName: 'Alpha', relevance: 50, createdAt: '2026-01-01T00:00:00.000Z' }),
      mk({ entityName: 'Beta', relevance: 99, createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const order = sortDigestAlerts(alerts).map((a) => `${a.entityName}:${a.createdAt}`);
    expect(order[0]).toBe('Beta:2026-01-01T00:00:00.000Z');
    // same relevance -> newest first, then company name asc
    expect(order[1]).toBe('Alpha:2026-01-02T00:00:00.000Z');
    expect(order[2]).toBe('Alpha:2026-01-01T00:00:00.000Z');
    expect(order[3]).toBe('Zeta:2026-01-01T00:00:00.000Z');
    // grouping preserves the flat order: Beta's top story, then Alpha, then Zeta
    expect(groupSortedDigestAlerts(alerts).map(([e]) => e)).toEqual(['Beta', 'Alpha', 'Zeta']);
  });

  it('clamps a headline over 110 chars on a word boundary', () => {
    const long = 'Word '.repeat(40).trim(); // 199 chars
    const clamped = clampHeadline(long);
    expect(clamped.length).toBeLessThanOrEqual(DIGEST_HEADLINE_MAX);
    expect(clamped.endsWith('…')).toBe(true);
    expect(clamped).not.toContain('  ');
    // short input is untouched, no ellipsis
    expect(clampHeadline('Short headline')).toBe('Short headline');
    expect(clampHeadline('x'.repeat(DIGEST_HEADLINE_MAX))).toBe('x'.repeat(DIGEST_HEADLINE_MAX));
  });

  it('caps a company at 3 stories then links the overflow (Variant A)', () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      mk({ entityName: 'Acme Games', relevance: 90 - i, url: `https://example.com/${i}`, createdAt: `2026-11-1${i}T09:00:00.000Z` }),
    );
    const html = renderDigestHtml(inputOf(five));
    expect(noopenerCount(html)).toBe(DIGEST_PER_COMPANY_MAX);
    expect(html).toContain('+2 more Acme Games updates in Terminal');
  });

  it('caps the whole digest at 15 stories then links See all N (Variant B)', () => {
    const twenty = Array.from({ length: 20 }, (_, i) =>
      mk({ entityName: `Co ${i}`, relevance: 100 - i, url: `https://example.com/${i}` }),
    );
    const html = renderDigestHtml(inputOf(twenty));
    expect(noopenerCount(html)).toBe(DIGEST_TOTAL_MAX);
    expect(html).toContain('See all 20 in Terminal');
  });

  it('renders the preheader from the top story', () => {
    const pre = renderDigestPreheader(buildSampleDigestAlerts('https://example.com'));
    expect(pre).toContain('Acme Games acquires Pixel Forge');
    expect(pre).toContain('Also:');
  });

  it('escapes <script>, quotes and & in summary, entity and source', () => {
    const html = renderDigestHtml(
      inputOf([
        mk({
          entityName: '<script>Acme</script>',
          summary: 'A & B <script>alert(1)</script> "quoted"',
          sourceName: 'Q"uote & <b>bold</b>',
        }),
      ]),
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</script>');
    expect(html).toContain('&lt;script&gt;Acme&lt;/script&gt;');
    expect(html).toContain('A &amp; B &lt;script&gt;alert(1)&lt;/script&gt; &quot;quoted&quot;');
    expect(html).toContain('Q&quot;uote &amp; &lt;b&gt;bold&lt;/b&gt;');
  });

  it('never puts javascript:, data: or http: article URLs in an href', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'http://insecure.example/article',
    ]) {
      const html = renderDigestHtml(inputOf([mk({ entityName: 'Acme', url })]));
      expect(html).not.toMatch(/href="(?:javascript:|data:|http:\/\/)/i);
      expect(html).toContain('A headline');
    }
  });

  it('keeps both layouts under the ~102KB Gmail clip', () => {
    const longSummary = `${'long headline text '.repeat(12)}`;
    const eight = Array.from({ length: 8 }, (_, i) =>
      mk({ entityName: `Company ${i}`, summary: longSummary, relevance: 90 - i, url: `https://example.com/${i}` }),
    );
    const twenty = Array.from({ length: 20 }, (_, i) =>
      mk({ entityName: `Company ${i % 6}`, summary: longSummary, relevance: 100 - i, url: `https://example.com/${i}` }),
    );
    expect(renderDigestHtml(inputOf(eight)).length).toBeLessThan(100 * 1024);
    expect(renderDigestHtml(inputOf(twenty)).length).toBeLessThan(100 * 1024);
  });

  it('keeps the unsubscribe URL and RFC 8058 headers unchanged', () => {
    expect(buildDigestUnsubHeaders('tok', 'https://example.com')).toEqual({
      'List-Unsubscribe': '<https://example.com/unsubscribe?token=tok>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    const html = renderDigestHtml(inputOf([mk({ entityName: 'Acme' })]));
    expect(html).toContain('href="https://example.com/unsubscribe?token=xyz"');
  });
});
