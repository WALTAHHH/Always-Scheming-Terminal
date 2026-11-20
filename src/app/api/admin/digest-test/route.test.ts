import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';

// ── mocks (hoisted) ────────────────────────────────────────────────────────

let mockRequireAdmin = vi.fn();
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

let mockSendEmail = vi.fn();
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  };
});

let mockGetUserById = vi.fn();
let mockFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { admin: { getUserById: (...a: unknown[]) => mockGetUserById(...a) } },
    from: (...a: unknown[]) => mockFrom(...a),
  })),
}));

import { POST } from './route';
import {
  DIGEST_TEST_RATE_LIMIT,
  describeDigestTestConfig,
  maskEmail,
  buildSampleDigestAlerts,
} from '@/lib/email';

// ── helpers ────────────────────────────────────────────────────────────────

/** Every builder handed out by the mocked `supabase.from()` this test. */
let builders: MockBuilder[] = [];

interface MockBuilder {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>;
}

/**
 * A thenable Postgrest-builder stand-in: every chained method returns itself
 * (so any call order resolves), `await` resolves to `result`, and every
 * mutating method is a spy so a test can assert the route never wrote.
 */
function createBuilder(result: { data?: unknown; error?: unknown } = { data: null, error: null }): MockBuilder {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    update: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled?: unknown, onRejected?: unknown) =>
      Promise.resolve(result).then(onFulfilled as never, onRejected as never),
  } as MockBuilder;
  builders.push(builder);
  return builder;
}

/** Queue the next `supabase.from()` result. */
function queueFrom(result?: { data?: unknown; error?: unknown }) {
  const builder = createBuilder(result);
  mockFrom.mockReturnValueOnce(builder);
  return builder;
}

const ENV_KEYS = [
  'RESEND_API_KEY',
  'DIGEST_FROM',
  'DIGEST_FOOTER_ADDRESS',
  'DIGEST_UNSUB_SECRET',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const SECRET_API_KEY = 're_test_key_do_not_log_123456';
const SECRET_SERVICE_KEY = 'service-role-key-do-not-log';
const ADMIN_EMAIL = 'matt@example.com';

let savedEnv: Record<string, string | undefined> = {};

/** A fully-configured mail + DB environment. */
function configureEnv() {
  process.env.RESEND_API_KEY = SECRET_API_KEY;
  process.env.DIGEST_FROM = 'AST Alerts <alerts@example.com>';
  process.env.DIGEST_FOOTER_ADDRESS = '1 Test Way, Neo Baku, AZ 1000';
  process.env.DIGEST_UNSUB_SECRET = 'unsub-secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://terminal.example.com';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.com';
  process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET_SERVICE_KEY;
}

/** Happy-path plumbing: an admin session, a recipient, and a successful send. */
function armHappyPath(userId: string) {
  mockRequireAdmin.mockResolvedValue({ userId });
  mockGetUserById.mockResolvedValue({
    data: { user: { id: userId, email: ADMIN_EMAIL } },
    error: null,
  });
  mockSendEmail.mockResolvedValue({ ok: true, id: 'resend-msg-1' });
}

function post() {
  return POST(new Request('http://localhost/api/admin/digest-test', { method: 'POST' }) as never);
}

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  builders = [];
  mockRequireAdmin = vi.fn();
  mockSendEmail = vi.fn();
  mockGetUserById = vi.fn();
  mockFrom = vi.fn();
  vi.clearAllMocks();
  // Fallback for any `supabase.from()` call a test did not explicitly queue: an
  // empty, error-free result. Tests that assert on a specific call still queue
  // it with `queueFrom` — once-values are consumed before this implementation.
  mockFrom.mockImplementation(() => createBuilder({ data: null, error: null }));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// ── auth ───────────────────────────────────────────────────────────────────

describe('POST /api/admin/digest-test — auth', () => {
  it('returns 401 when the caller has no session', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const res = await post();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    // No email work happens before the auth gate.
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is authenticated but not an admin', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await post();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ── unconfigured env ───────────────────────────────────────────────────────

describe('POST /api/admin/digest-test — unconfigured env', () => {
  it('returns config diagnostics + sent:false without throwing (no Resend key)', async () => {
    mockRequireAdmin.mockResolvedValue({ userId: 'admin-unconfigured-1' });
    process.env.DIGEST_FROM = 'AST Alerts <alerts@example.com>';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://terminal.example.com';

    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sent).toBe(false);
    expect(body.error).toBe('email_not_configured');
    expect(body.config).toEqual({
      apiKey: 'missing',
      from: 'set',
      footerAddress: 'missing',
      unsubSecret: 'missing',
      siteUrl: 'https://terminal.example.com',
    });
    // Never touched Supabase or the transport.
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('reports a missing DIGEST_FROM independently of the API key', async () => {
    mockRequireAdmin.mockResolvedValue({ userId: 'admin-unconfigured-2' });
    process.env.RESEND_API_KEY = SECRET_API_KEY;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://terminal.example.com';

    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sent).toBe(false);
    expect(body.config.apiKey).toBe('set');
    expect(body.config.from).toBe('missing');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('never echoes a secret value in the response body', async () => {
    configureEnv();
    armHappyPath('admin-secret-check');
    queueFrom({ data: [], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });

    const res = await post();
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain(SECRET_API_KEY);
    expect(raw).not.toContain(SECRET_SERVICE_KEY);
  });
});

// ── sample fallback ────────────────────────────────────────────────────────

describe('POST /api/admin/digest-test — sample fallback', () => {
  it('sends 3 clearly-labelled SAMPLE alerts with a [TEST] subject when there are no real ones', async () => {
    configureEnv();
    armHappyPath('admin-sample');
    queueFrom({ data: [], error: null }); // no pending alert_events
    queueFrom({ data: { digest_unsub_token: null }, error: null });

    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sent).toBe(true);
    expect(body.sample).toBe(true);
    expect(body.alert_count).toBe(3);
    expect(body.resend_id).toBe('resend-msg-1');
    expect(body.to).toBe('m***@example.com');
    expect(body.from).toBe('AST Alerts <alerts@example.com>');
    expect(body.subject.startsWith('[TEST]')).toBe(true);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendEmail.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
      headers: Record<string, string>;
    };
    // Real recipient (unmasked) is what the transport receives.
    expect(sent.to).toBe(ADMIN_EMAIL);
    expect(sent.subject.startsWith('[TEST]')).toBe(true);
    // All three sample rows are rendered and clearly labelled.
    expect(sent.html).toContain('SAMPLE');
    expect((sent.html.match(/SAMPLE/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // Production-shape unsubscribe link + RFC 8058 headers + CAN-SPAM footer.
    expect(sent.headers['List-Unsubscribe']).toContain(
      '<https://terminal.example.com/unsubscribe?token=',
    );
    expect(sent.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(sent.html).toContain('https://terminal.example.com/unsubscribe?token=');
    expect(sent.html).toContain('1 Test Way, Neo Baku, AZ 1000');
    expect(sent.text).toContain('1 Test Way, Neo Baku, AZ 1000');
  });

  it('reuses the admin’s stored unsubscribe token when one exists — and writes nothing', async () => {
    configureEnv();
    armHappyPath('admin-sample-token');
    queueFrom({ data: [], error: null });
    queueFrom({ data: { digest_unsub_token: 'a'.repeat(64) }, error: null });

    const res = await post();
    const body = await res.json();
    expect(body.unsubscribe_token_reused).toBe(true);
    const sent = mockSendEmail.mock.calls[0][0] as { headers: Record<string, string> };
    expect(sent.headers['List-Unsubscribe']).toContain(`token=${'a'.repeat(64)}`);
    // A stored token needs no persistence — no upsert anywhere.
    expect(builders.filter((b) => b.upsert.mock.calls.length > 0)).toHaveLength(0);
  });

  it('mints and persists a token when none is stored, and the emailed link uses that token', async () => {
    configureEnv();
    armHappyPath('admin-no-token');
    queueFrom({ data: [], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });
    const upsertBuilder = queueFrom({ data: null, error: null });

    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(true);
    expect(body.unsubscribe_token_reused).toBe(false);

    // The freshly-minted token is written to this admin's row.
    expect(upsertBuilder.upsert).toHaveBeenCalledTimes(1);
    const [payload] = upsertBuilder.upsert.mock.calls[0] as [Record<string, unknown>];
    expect(payload.user_id).toBe('admin-no-token');
    const persisted = payload.digest_unsub_token as string;
    expect(persisted).toMatch(/^[a-f0-9]{64}$/);

    // …and it is exactly the token the recipient can actually click: the same
    // value appears in the List-Unsubscribe header and the rendered HTML body.
    const sent = mockSendEmail.mock.calls[0][0] as {
      html: string;
      headers: Record<string, string>;
    };
    expect(sent.headers['List-Unsubscribe']).toContain(`token=${persisted}`);
    expect(sent.html).toContain(`unsubscribe?token=${persisted}`);
  });

  it('fails closed (500) when the token cannot be persisted — never mails a dead link', async () => {
    configureEnv();
    armHappyPath('admin-persist-fail');
    queueFrom({ data: [], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });
    queueFrom({ data: null, error: { message: 'boom' } });

    const res = await post();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.sent).toBe(false);
    expect(body.error).toBe('token_persist_failed');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('buildSampleDigestAlerts returns exactly 3 SAMPLE-labelled alerts on the site origin', () => {
    const alerts = buildSampleDigestAlerts('https://terminal.example.com/');
    expect(alerts).toHaveLength(3);
    for (const a of alerts) {
      expect(a.summary).toContain('SAMPLE');
      expect(a.url.startsWith('https://terminal.example.com/')).toBe(true);
    }
  });
});

// ── real alerts ────────────────────────────────────────────────────────────

describe('POST /api/admin/digest-test — real alerts', () => {
  it('renders the calling admin’s own unsent alerts instead of samples', async () => {
    configureEnv();
    armHappyPath('admin-real');
    queueFrom({
      data: [
        {
          id: 'alert-1',
          user_id: 'admin-real',
          signal_id: 'sig-1',
          entity_id: 'ent-1',
          signal_type: 'acquisition',
          score: 0.91,
          created_at: '2026-11-17T00:00:00.000Z',
        },
      ],
      error: null,
    });
    queueFrom({ data: [{ id: 'ent-1', canonical_name: 'Real Target Co' }], error: null });
    queueFrom({
      data: [{ id: 'sig-1', summary: 'Real Target Co is acquired by BigCo.', content_id: 'c-1' }],
      error: null,
    });
    queueFrom({ data: [{ id: 'c-1', url: 'https://news.example.com/story', source_id: 's-1' }], error: null });
    queueFrom({ data: [{ id: 's-1', name: 'The Game Business' }], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(true);
    expect(body.sample).toBe(false);
    expect(body.alert_count).toBe(1);

    const sent = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(sent.html).toContain('Real Target Co');
    expect(sent.html).toContain('https://news.example.com/story');
    // Real-alert path renders the same source · date meta line as the sample path.
    expect(sent.html).toContain('The Game Business · Nov 17');
    expect(sent.html).toContain('https://terminal.example.com/?company=Real%20Target%20Co');
    expect(sent.html).not.toContain('Acme Games'); // no sample bleed-through
  });

  it('scopes the pending-alert read to the calling admin only', async () => {
    configureEnv();
    armHappyPath('admin-scope');
    const alertBuilder = queueFrom({ data: [], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });

    await post();

    expect(mockFrom).toHaveBeenCalledWith('alert_events');
    expect(alertBuilder.eq).toHaveBeenCalledWith('user_id', 'admin-scope');
    expect(alertBuilder.is).toHaveBeenCalledWith('email_sent_at', null);
  });

  it('escapes HTML in alert text before it reaches the email body', async () => {
    configureEnv();
    armHappyPath('admin-escape');
    queueFrom({
      data: [
        {
          id: 'alert-x',
          user_id: 'admin-escape',
          signal_id: 'sig-x',
          entity_id: 'ent-x',
          signal_type: 'acquisition',
          score: 0.9,
          created_at: '2026-11-17T00:00:00.000Z',
        },
      ],
      error: null,
    });
    queueFrom({
      data: [{ id: 'ent-x', canonical_name: '<img src=x onerror=alert(1)>' }],
      error: null,
    });
    queueFrom({
      data: [{ id: 'sig-x', summary: '"><script>alert(2)</script>', content_id: 'c-x' }],
      error: null,
    });
    queueFrom({ data: [{ id: 'c-x', url: 'javascript:alert(3)' }], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });

    await post();

    const sent = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(sent.html).not.toContain('<script>');
    expect(sent.html).not.toContain('onerror=alert(1)>');
    expect(sent.html).toContain('&lt;script&gt;');
    // A non-http(s) article URL is never emitted as a link.
    expect(sent.html).not.toContain('javascript:alert(3)');
  });
});

// ── no side effects ────────────────────────────────────────────────────────

describe('POST /api/admin/digest-test — no side effects', () => {
  it('writes only the calling admin’s digest_unsub_token — no update/insert/delete anywhere', async () => {
    configureEnv();
    armHappyPath('admin-nowrite');
    queueFrom({ data: [], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });
    const upsertBuilder = queueFrom({ data: null, error: null });

    const res = await post();
    expect(res.status).toBe(200);

    for (const builder of builders) {
      expect(builder.update).not.toHaveBeenCalled();
      expect(builder.insert).not.toHaveBeenCalled();
      expect(builder.delete).not.toHaveBeenCalled();
    }

    // The single permitted write: an upsert carrying ONLY the user id and the
    // freshly-minted token — never watchlist_email, last_digest_sent_at, etc.
    const upserts = builders.filter((b) => b.upsert.mock.calls.length > 0);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toBe(upsertBuilder);
    const [payload] = upsertBuilder.upsert.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(payload).sort()).toEqual(['digest_unsub_token', 'user_id']);
    expect(payload.user_id).toBe('admin-nowrite');
  });

  it('does not stamp email_sent_at even with real pending alerts', async () => {
    configureEnv();
    armHappyPath('admin-nowrite-real');
    const alertBuilder = queueFrom({
      data: [
        {
          id: 'alert-nw',
          user_id: 'admin-nowrite-real',
          signal_id: 'sig-nw',
          entity_id: null,
          signal_type: 'fundraising',
          score: 0.8,
          created_at: '2026-11-17T00:00:00.000Z',
        },
      ],
      error: null,
    });
    queueFrom({ data: [], error: null }); // signals lookup
    queueFrom({ data: { digest_unsub_token: null }, error: null });

    await post();

    expect(alertBuilder.update).not.toHaveBeenCalled();
    // No UPDATE statement anywhere in the route.
    for (const builder of builders) {
      expect(builder.update).not.toHaveBeenCalled();
    }
  });
});

// ── transport failures ─────────────────────────────────────────────────────

describe('POST /api/admin/digest-test — Resend failure', () => {
  it('returns 502 with the Resend status + message and no key', async () => {
    configureEnv();
    armHappyPath('admin-resend-fail');
    mockSendEmail.mockResolvedValue({
      ok: false,
      error: 'resend_422',
      status: 422,
      detail: '{"message":"Invalid from address"}',
    });
    queueFrom({ data: [], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });

    const res = await post();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.sent).toBe(false);
    expect(body.resend_status).toBe(422);
    expect(body.resend_error).toContain('Invalid from address');
    expect(JSON.stringify(body)).not.toContain(SECRET_API_KEY);
  });

  it('returns sent:false (200) when the transport reports a skipped send', async () => {
    configureEnv();
    armHappyPath('admin-resend-skip');
    mockSendEmail.mockResolvedValue({ ok: false, skipped: true });
    queueFrom({ data: [], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });

    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(false);
    expect(body.error).toBe('email_not_configured');
  });
});

// ── rate limit ─────────────────────────────────────────────────────────────

describe('POST /api/admin/digest-test — rate limit', () => {
  it(`allows ${DIGEST_TEST_RATE_LIMIT.maxRequests}/hour then returns 429`, async () => {
    configureEnv();
    const userId = 'admin-rate-limited';
    armHappyPath(userId);

    // First N requests: each needs its own queued reads.
    for (let i = 0; i < DIGEST_TEST_RATE_LIMIT.maxRequests; i++) {
      queueFrom({ data: [], error: null });
      queueFrom({ data: { digest_unsub_token: null }, error: null });
      const ok = await post();
      expect(ok.status).toBe(200);
    }

    const blocked = await post();
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.sent).toBe(false);
    expect(body.error).toBe('rate_limited');
    expect(body.retry_after_seconds).toBeGreaterThanOrEqual(0);
    // The blocked request did no work.
    expect(mockSendEmail).toHaveBeenCalledTimes(DIGEST_TEST_RATE_LIMIT.maxRequests);
  });

  it('rate-limits per admin, not globally', async () => {
    configureEnv();
    const userId = 'admin-rate-b';
    armHappyPath(userId);
    for (let i = 0; i < DIGEST_TEST_RATE_LIMIT.maxRequests; i++) {
      queueFrom({ data: [], error: null });
      queueFrom({ data: { digest_unsub_token: null }, error: null });
      expect((await post()).status).toBe(200);
    }
    expect((await post()).status).toBe(429);

    // A different admin still has their own budget.
    armHappyPath('admin-rate-other');
    queueFrom({ data: [], error: null });
    queueFrom({ data: { digest_unsub_token: null }, error: null });
    expect((await post()).status).toBe(200);
  });
});

// ── pure helpers ───────────────────────────────────────────────────────────

describe('digest-test helpers', () => {
  it('maskEmail masks the local part but keeps the domain', () => {
    expect(maskEmail('matt@example.com')).toBe('m***@example.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });

  it('describeDigestTestConfig reports presence independently per var', () => {
    const cfg = describeDigestTestConfig({
      RESEND_API_KEY: 'k',
      DIGEST_FROM: '   ',
      DIGEST_FOOTER_ADDRESS: '1 Way',
      DIGEST_UNSUB_SECRET: 's',
      NEXT_PUBLIC_SITE_URL: 'https://x.example/',
    });
    expect(cfg).toEqual({
      apiKey: 'set',
      from: 'missing', // whitespace-only counts as missing
      footerAddress: 'set',
      unsubSecret: 'set',
      siteUrl: 'https://x.example', // trailing slash stripped
    });
  });
});
