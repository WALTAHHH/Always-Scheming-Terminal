import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAlertCandidates,
  fanOutAlerts,
  DEFAULT_WATCHLIST_MIN_SCORE,
  isMondayUtc,
  isDigestDue,
  isDigestEnabled,
  sendWeeklyDigests,
  type SignalRow,
  type ContentTagRow,
  type WatchlistRow,
  type PrefRow,
  type AlertCandidate,
} from './alerts';
import {
  getEmailConfig,
  sendEmail,
  generateDigestUnsubToken,
  buildDigestUnsubUrl,
  buildDigestUnsubHeaders,
  getDigestFooterAddress,
  getSiteUrl,
} from './email';

// Mock the IO / side-effectful email helpers, but keep the *pure* renderers
// (renderDigestHtml / renderDigestText / renderDigestSubject) real so the digest
// send path can be exercised end-to-end by the concurrency tests below.
vi.mock('./email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./email')>();
  return {
    ...actual,
    getEmailConfig: vi.fn(),
    sendEmail: vi.fn(),
    generateDigestUnsubToken: vi.fn(),
    buildDigestUnsubUrl: vi.fn(),
    buildDigestUnsubHeaders: vi.fn(),
    getDigestFooterAddress: vi.fn(),
    getSiteUrl: vi.fn(),
  };
});

describe('buildAlertCandidates', () => {
  const signal1: SignalRow = {
    id: 'sig1',
    content_id: 'cont1',
    signal_type: 'earnings',
    investment_relevance_score: 0.8,
  };
  const signal2: SignalRow = {
    id: 'sig2',
    content_id: 'cont2',
    signal_type: 'acquisition',
    investment_relevance_score: 0.6,
  };
  const contentTag1: ContentTagRow = { content_id: 'cont1', entity_id: 'ent1' };
  const contentTag2: ContentTagRow = { content_id: 'cont2', entity_id: 'ent2' };
  const watchlist1: WatchlistRow = { id: 'watch1', user_id: 'user1', entity_id: 'ent1' };
  const watchlist2: WatchlistRow = { id: 'watch2', user_id: 'user2', entity_id: 'ent2' };
  const watchlist3: WatchlistRow = { id: 'watch3', user_id: 'user1', entity_id: 'ent2' };
  const pref1: PrefRow = { user_id: 'user1', watchlist_min_score: 0.7 };
  const pref2: PrefRow = { user_id: 'user2', watchlist_min_score: null };

  it('filters by threshold', () => {
    const candidates = buildAlertCandidates(
      [signal1, signal2],
      [contentTag1, contentTag2],
      [watchlist1, watchlist2],
      [pref1, pref2],
    );
    // user1 threshold 0.7, signal1 score 0.8 >= threshold => include
    // user2 threshold null defaults to 0.75, signal2 score 0.6 < threshold => exclude
    expect(candidates).toHaveLength(1);
    expect(candidates[0].user_id).toBe('user1');
    expect(candidates[0].signal_id).toBe('sig1');
  });

  it('uses default threshold when missing prefs', () => {
    const candidates = buildAlertCandidates(
      [signal2], // score 0.6
      [contentTag2],
      [watchlist2],
      [], // no prefs
    );
    expect(candidates).toHaveLength(0); // default 0.75 > 0.6
  });

  it('dedup per user per signal', () => {
    // Two watchlists for same entity? Actually same entity but different watchlist ids for same user.
    const watchlist1b: WatchlistRow = { id: 'watch1b', user_id: 'user1', entity_id: 'ent1' };
    const candidates = buildAlertCandidates(
      [signal1],
      [contentTag1],
      [watchlist1, watchlist1b],
      [pref1],
    );
    // Only one candidate, tiebreak by lowest watchlist id
    expect(candidates).toHaveLength(1);
    expect(candidates[0].watchlist_id).toBe('watch1');
  });

  it('dedup across multiple entities linked to same signal', () => {
    // Same signal linked to two entities via two content tags (same content id)
    const contentTag1b: ContentTagRow = { content_id: 'cont1', entity_id: 'ent3' };
    const watchlist3: WatchlistRow = { id: 'watch3', user_id: 'user1', entity_id: 'ent3' };
    const candidates = buildAlertCandidates(
      [signal1],
      [contentTag1, contentTag1b],
      [watchlist1, watchlist3],
      [pref1],
    );
    // Still one candidate per (user,signal)
    expect(candidates).toHaveLength(1);
  });

  it('handles missing score (null)', () => {
    const signalNoScore: SignalRow = {
      id: 'sig3',
      content_id: 'cont3',
      signal_type: 'layoffs',
      investment_relevance_score: null,
    };
    const tag: ContentTagRow = { content_id: 'cont3', entity_id: 'ent1' };
    const candidates = buildAlertCandidates(
      [signalNoScore],
      [tag],
      [watchlist1],
      [pref1],
    );
    // score treated as 0, less than threshold => no candidates
    expect(candidates).toHaveLength(0);
  });

  it('ignores rows with missing ids', () => {
    const malformedWatchlist: WatchlistRow = { id: 'watchX', user_id: '', entity_id: 'ent1' };
    const candidates = buildAlertCandidates(
      [signal1],
      [contentTag1],
      [malformedWatchlist],
      [pref1],
    );
    expect(candidates).toHaveLength(0);
  });
});

describe('fanOutAlerts', () => {
  const mockSupabase = {
    from: vi.fn(() => mockSupabase),
    select: vi.fn(() => mockSupabase),
    eq: vi.fn(() => mockSupabase),
    in: vi.fn(() => mockSupabase),
    order: vi.fn(() => mockSupabase),
    limit: vi.fn(() => mockSupabase),
    maybeSingle: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero when no signal ids', async () => {
    const result = await fanOutAlerts([]);
    expect(result).toEqual({ candidates: 0, created: 0 });
  });

  it('returns zero when Supabase credentials missing', async () => {
    // Temporarily unset env vars
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const result = await fanOutAlerts(['sig1']);
    expect(result).toEqual({ candidates: 0, created: 0 });
    
    // Restore
    if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  // More integration tests could be added but we'll keep it simple.
  describe('weekly digest gating', () => {
    it('isMondayUtc returns true for Monday UTC', () => {
      // Monday 2026-11-16 00:00 UTC (example)
      const monday = new Date('2026-11-16T00:00:00Z');
      expect(isMondayUtc(monday)).toBe(true);
    });

    it('isMondayUtc returns false for Tuesday UTC', () => {
      const tuesday = new Date('2026-11-17T00:00:00Z');
      expect(isMondayUtc(tuesday)).toBe(false);
    });

    it('isDigestDue returns true when last_digest_sent_at is null', () => {
      const now = new Date('2026-11-16T12:00:00Z');
      expect(isDigestDue(null, now)).toBe(true);
    });

    it('isDigestDue returns true when last_digest_sent_at older than 6 days', () => {
      const now = new Date('2026-11-16T12:00:00Z');
      const last = new Date('2026-11-09T12:00:00Z'); // 7 days ago
      expect(isDigestDue(last.toISOString(), now)).toBe(true);
    });

    it('isDigestDue returns false when last_digest_sent_at within 6 days', () => {
      const now = new Date('2026-11-16T12:00:00Z');
      const last = new Date('2026-11-14T12:00:00Z'); // 2 days ago
      expect(isDigestDue(last.toISOString(), now)).toBe(false);
    });

    it('isDigestEnabled returns false when watchlist_email === false', () => {
      expect(isDigestEnabled({ watchlist_email: false })).toBe(false);
      expect(isDigestEnabled({ watchlist_email: false, digest: true })).toBe(false);
    });

    it('isDigestEnabled returns true when watchlist_email missing or true', () => {
      expect(isDigestEnabled({})).toBe(true);
      expect(isDigestEnabled({ watchlist_email: true })).toBe(true);
      expect(isDigestEnabled({ digest: false })).toBe(true);
    });
  });

  describe('sendWeeklyDigests', () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      auth: {
        admin: {
          getUserById: vi.fn(),
        },
      },
    };

    // Mock email functions
    const mockGetEmailConfig = vi.mocked(getEmailConfig);
    const mockSendEmail = vi.mocked(sendEmail);
    const mockGenerateDigestUnsubToken = vi.mocked(generateDigestUnsubToken);
    const mockBuildDigestUnsubUrl = vi.mocked(buildDigestUnsubUrl);
    const mockBuildDigestUnsubHeaders = vi.mocked(buildDigestUnsubHeaders);
    const mockGetDigestFooterAddress = vi.mocked(getDigestFooterAddress);
    const mockGetSiteUrl = vi.mocked(getSiteUrl);

    beforeEach(() => {
      vi.clearAllMocks();
      mockSupabase.from.mockClear();
      mockSupabase.select.mockClear();
      mockSupabase.eq.mockClear();
      mockSupabase.in.mockClear();
      mockSupabase.order.mockClear();
      mockSupabase.is.mockClear();
      mockSupabase.gte.mockClear();
      mockSupabase.not.mockClear();
      mockSupabase.maybeSingle.mockClear();
      mockSupabase.auth.admin.getUserById.mockClear();

      // Default mocks
      mockGetEmailConfig.mockReturnValue({ apiKey: 're_key', from: 'alerts@example.com' });
      mockSendEmail.mockResolvedValue({ ok: true, id: 'msg_123' });
      mockGenerateDigestUnsubToken.mockReturnValue('a'.repeat(64));
      mockBuildDigestUnsubUrl.mockImplementation((token, baseUrl) => `${baseUrl || 'https://terminal.always-scheming.com'}/unsubscribe?token=${token}`);
      mockBuildDigestUnsubHeaders.mockImplementation((token, baseUrl) => ({
        'List-Unsubscribe': `<${(baseUrl || 'https://terminal.always-scheming.com')}/unsubscribe?token=${token}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }));
      mockGetDigestFooterAddress.mockReturnValue('123 Main St');
      mockGetSiteUrl.mockReturnValue('https://terminal.always-scheming.com');
    });

    it('skips when not Monday UTC', async () => {
      const result = await sendWeeklyDigests({
        now: new Date('2026-11-17T12:00:00Z'), // Tuesday
      });
      expect(result.skipped).toBe('not_monday');
      expect(result.sent).toBe(0);
    });

    it('skips when Resend not configured', async () => {
      mockGetEmailConfig.mockReturnValue(null);
      const result = await sendWeeklyDigests({
        now: new Date('2026-11-16T12:00:00Z'), // Monday
      });
      expect(result.skipped).toBe('unconfigured');
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('skips when Supabase service role missing', async () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const result = await sendWeeklyDigests({
        now: new Date('2026-11-16T12:00:00Z'),
      });
      expect(result.skipped).toBe('no_client');
      if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    });

    it('returns empty when no pending alerts', async () => {
      // Mock supabase queries to return empty arrays
      mockSupabase.maybeSingle.mockResolvedValue({ data: [], error: null });
      const result = await sendWeeklyDigests({
        supabase: mockSupabase,
        now: new Date('2026-11-16T12:00:00Z'),
      });
      expect(result.skipped).toBe(null);
      expect(result.usersConsidered).toBe(0);
      expect(result.sent).toBe(0);
      expect(result.alertsEmailed).toBe(0);
    });



    it('is idempotent: second run with same pending alerts does not send duplicate', async () => {
      // Simulate that email_sent_at has been stamped (pending query returns empty)
      const now = new Date('2026-11-16T12:00:00Z');
      mockSupabase.from.mockImplementation((table) => ({
        then: (resolve) => resolve({ data: [], error: null }),
        select: function() { return this; },
        eq: function() { return this; },
        in: function() { return this; },
        order: function() { return this; },
        is: function() { return this; },
        gte: function() { return this; },
        not: function() { return this; },
        maybeSingle: function() { return this; },
      }));
      const result = await sendWeeklyDigests({
        supabase: mockSupabase,
        now,
      });
      expect(result.skipped).toBe(null);
      expect(result.sent).toBe(0);
      expect(result.alertsEmailed).toBe(0);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  // Safety: migration 018 (watchlists/alert_events) may not be applied in an
  // environment yet. The fan-out MUST log and no-op, never throw, so the
  // signal-extraction cron can never fail because of the watchlist feature.
  it('no-ops without throwing when watchlist tables do not exist (migration 018 unapplied)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const signals = [
      { id: 'sig1', content_id: 'cont1', signal_type: 'earnings', investment_relevance_score: 0.9 },
    ];
    const contentTags = [{ content_id: 'cont1', entity_id: 'ent1' }];
    const chain: any = {
      from(table: string) { chain._table = table; return chain; },
      select() { return chain; },
      in() { return chain; },
      eq() { return chain; },
      not() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(resolve: any) {
        const table = chain._table;
        if (table === 'signals') return resolve({ data: signals, error: null });
        if (table === 'content_tags') return resolve({ data: contentTags, error: null });
        // watchlists / alert_events not created yet → Postgres "relation does not exist"
        return resolve({
          data: null,
          error: { message: `relation "${table}" does not exist` },
        });
      },
    };

    await expect(
      fanOutAlerts(['sig1'], { supabase: chain }),
    ).resolves.toEqual({ candidates: 0, created: 0 });
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Atomic digest claim: at-most-once under concurrent invocation (HIGH #2).
//
// A stateful fake Supabase whose `.update()` reads and writes its row store
// synchronously — mirroring Postgres' row-locked, single-statement UPDATE — so
// two overlapping `sendWeeklyDigests` calls contend for the same cadence stamp
// exactly as they would against the real database.
// ─────────────────────────────────────────────────────────────────────────
function makeFakeBackend(seed: {
  prefs: Array<Record<string, unknown> & { user_id: string }>;
  alerts: Array<Record<string, unknown> & { id: string }>;
  entities?: Array<Record<string, unknown>>;
  signals?: Array<Record<string, unknown>>;
  content?: Array<Record<string, unknown>>;
}) {
  const state: Record<string, Array<Record<string, unknown>>> = {
    user_preferences: seed.prefs.map((p) => ({ ...p })),
    alert_events: seed.alerts.map((a) => ({ ...a })),
    entities: (seed.entities ?? []).map((e) => ({ ...e })),
    signals: (seed.signals ?? []).map((s) => ({ ...s })),
    content: (seed.content ?? []).map((c) => ({ ...c })),
  };
  let failAlertStamp = false;

  function makeBuilder(table: string): any {
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, unknown> | null = null;
    const preds: Array<(row: any) => boolean> = [];

    const builder: any = {
      select() {
        return builder;
      },
      update(p: Record<string, unknown>) {
        op = 'update';
        payload = p;
        return builder;
      },
      eq(col: string, val: unknown) {
        preds.push((r) => r[col] === val);
        return builder;
      },
      is(col: string, val: unknown) {
        preds.push((r) => (val === null ? r[col] == null : r[col] === val));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        preds.push((r) => vals.includes(r[col]));
        return builder;
      },
      gte(col: string, val: unknown) {
        preds.push((r) => (r[col] as any) >= val);
        return builder;
      },
      lte(col: string, val: unknown) {
        preds.push((r) => (r[col] as any) <= val);
        return builder;
      },
      lt(col: string, val: unknown) {
        preds.push((r) => (r[col] as any) < val);
        return builder;
      },
      not(col: string, _operator: string, val: unknown) {
        preds.push((r) => !(val === null ? r[col] == null : r[col] === val));
        return builder;
      },
      or() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        return builder;
      },
      then(resolve: (value: unknown) => unknown) {
        const rows = state[table] ?? [];
        const matched = rows.filter((r) => preds.every((p) => p(r)));

        if (op === 'update') {
          if (table === 'alert_events' && failAlertStamp) {
            resolve({ data: null, error: { message: 'simulated stamp failure' } });
            return;
          }
          // Synchronous read-modify-write == one atomic statement.
          for (const row of matched) Object.assign(row, payload);
          resolve({
            data: matched.map((r) => ({ user_id: r.user_id })),
            error: null,
          });
          return;
        }
        resolve({ data: matched.map((r) => ({ ...r })), error: null });
      },
    };
    return builder;
  }

  const client: any = {
    from: (table: string) => makeBuilder(table),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, email: `${id}@example.com` } },
          error: null,
        }),
      },
    },
  };

  return {
    client,
    state,
    setFailAlertStamp: (v: boolean) => {
      failAlertStamp = v;
    },
  };
}

describe('sendWeeklyDigests — atomic claim (at-most-once)', () => {
  const now = new Date('2026-11-16T12:00:00Z'); // Monday UTC

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailConfig).mockReturnValue({ apiKey: 're_key', from: 'alerts@example.com' });
    vi.mocked(getDigestFooterAddress).mockReturnValue('123 Main St');
    vi.mocked(getSiteUrl).mockReturnValue('https://terminal.always-scheming.com');
    vi.mocked(generateDigestUnsubToken).mockReturnValue('a'.repeat(64));
    vi.mocked(buildDigestUnsubUrl).mockReturnValue(
      'https://terminal.always-scheming.com/unsubscribe?token=a',
    );
    vi.mocked(buildDigestUnsubHeaders).mockReturnValue({
      'List-Unsubscribe': '<https://terminal.always-scheming.com/unsubscribe?token=a>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  function seed() {
    return makeFakeBackend({
      prefs: [
        {
          user_id: 'user1',
          notification_prefs: { watchlist_email: true },
          last_digest_sent_at: null,
          digest_unsub_token: 'a'.repeat(64),
        },
      ],
      alerts: [
        {
          id: 'al1',
          user_id: 'user1',
          signal_id: 'sig1',
          entity_id: 'ent1',
          signal_type: 'earnings',
          score: 0.9,
          created_at: '2026-11-16T00:00:00Z',
          email_sent_at: null,
        },
      ],
      entities: [{ id: 'ent1', canonical_name: 'Acme' }],
      signals: [{ id: 'sig1', summary: 'Acme beats estimates', content_id: 'cont1' }],
      content: [{ id: 'cont1', url: 'https://example.com/a' }],
    });
  }

  it('sends at most one digest when two runs overlap on the same Monday', async () => {
    const backend = seed();
    const sendImpl = vi.fn(async () => ({ ok: true, id: 'msg_1' }));

    // Two concurrent invocations, exactly the cron self-chaining scenario.
    const [a, b] = await Promise.all([
      sendWeeklyDigests({ supabase: backend.client, now, sendEmailImpl: sendImpl }),
      sendWeeklyDigests({ supabase: backend.client, now, sendEmailImpl: sendImpl }),
    ]);

    // The window claim lets exactly one run through; the other sees "taken".
    expect(sendImpl).toHaveBeenCalledTimes(1);
    expect(a.sent + b.sent).toBe(1);
    expect(a.failed + b.failed).toBe(0);

    // Ledger + cadence stamps written exactly once.
    expect(backend.state.user_preferences[0].last_digest_sent_at).toBe(now.toISOString());
    expect(backend.state.alert_events[0].email_sent_at).toBe(now.toISOString());
  });

  it('is idempotent: a later run the same Monday sends nothing', async () => {
    const backend = seed();
    const sendImpl = vi.fn(async () => ({ ok: true, id: 'msg_1' }));

    const first = await sendWeeklyDigests({ supabase: backend.client, now, sendEmailImpl: sendImpl });
    expect(first.sent).toBe(1);

    const second = await sendWeeklyDigests({ supabase: backend.client, now, sendEmailImpl: sendImpl });
    expect(second.sent).toBe(0);
    expect(second.alertsEmailed).toBe(0);
    expect(sendImpl).toHaveBeenCalledTimes(1);
  });

  it('retains the claim when the send succeeded but the email_sent_at stamp failed (AC#4)', async () => {
    const backend = seed();
    backend.setFailAlertStamp(true);
    const sendImpl = vi.fn(async () => ({ ok: true, id: 'msg_1' }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r1 = await sendWeeklyDigests({ supabase: backend.client, now, sendEmailImpl: sendImpl });
    expect(r1.sent).toBe(0);
    expect(r1.failed).toBe(1);
    expect(sendImpl).toHaveBeenCalledTimes(1);
    // Claim held (cadence stamped before send) and the alert stays un-stamped.
    expect(backend.state.user_preferences[0].last_digest_sent_at).toBe(now.toISOString());
    expect(backend.state.alert_events[0].email_sent_at).toBeNull();

    // Same-Monday re-run must NOT re-send (at-most-once).
    const r2 = await sendWeeklyDigests({ supabase: backend.client, now, sendEmailImpl: sendImpl });
    expect(r2.sent).toBe(0);
    expect(sendImpl).toHaveBeenCalledTimes(1);

    errSpy.mockRestore();
  });

  it('releases the claim when the send fails, so a later run retries', async () => {
    const backend = seed();
    const failing = vi.fn(async () => ({ ok: false, error: 'resend_500' }));

    const r1 = await sendWeeklyDigests({ supabase: backend.client, now, sendEmailImpl: failing });
    expect(r1.failed).toBe(1);
    expect(r1.sent).toBe(0);
    // Nothing delivered → the cadence stamp is restored so the window is retryable.
    expect(backend.state.user_preferences[0].last_digest_sent_at).toBeNull();
    expect(backend.state.alert_events[0].email_sent_at).toBeNull();

    const ok = vi.fn(async () => ({ ok: true, id: 'msg_2' }));
    const r2 = await sendWeeklyDigests({ supabase: backend.client, now, sendEmailImpl: ok });
    expect(r2.sent).toBe(1);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(backend.state.user_preferences[0].last_digest_sent_at).toBe(now.toISOString());
  });

  it('does not send when the cadence gate is not due (within 6 days)', async () => {
    const backend = makeFakeBackend({
      prefs: [
        {
          user_id: 'user1',
          notification_prefs: { watchlist_email: true },
          last_digest_sent_at: '2026-11-14T12:00:00Z', // 2 days ago
          digest_unsub_token: 'a'.repeat(64),
        },
      ],
      alerts: [
        {
          id: 'al1',
          user_id: 'user1',
          signal_id: 'sig1',
          entity_id: 'ent1',
          signal_type: 'earnings',
          score: 0.9,
          created_at: '2026-11-16T00:00:00Z',
          email_sent_at: null,
        },
      ],
    });
    const sendImpl = vi.fn(async () => ({ ok: true, id: 'msg_1' }));
    const r = await sendWeeklyDigests({ supabase: backend.client, now, sendEmailImpl: sendImpl });
    expect(r.sent).toBe(0);
    expect(sendImpl).not.toHaveBeenCalled();
    // Untouched cadence stamp preserved.
    expect(backend.state.user_preferences[0].last_digest_sent_at).toBe('2026-11-14T12:00:00Z');
  });
});
