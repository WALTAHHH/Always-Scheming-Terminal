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
  renderDigestSubject,
  renderDigestHtml,
  renderDigestText,
} from './email';

// Mock email module to isolate digest tests
vi.mock('./email', () => ({
  getEmailConfig: vi.fn(),
  sendEmail: vi.fn(),
  generateDigestUnsubToken: vi.fn(),
  buildDigestUnsubUrl: vi.fn(),
  buildDigestUnsubHeaders: vi.fn(),
  getDigestFooterAddress: vi.fn(),
  getSiteUrl: vi.fn(),
  renderDigestHtml: vi.fn(() => '<html></html>'),
  renderDigestSubject: vi.fn((n: number) => `Weekly AST watchlist digest — ${n} updates`),
  renderDigestText: vi.fn(() => 'text'),
}));

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

    // Opt-in semantics: only an explicit `watchlist_email === true` enables the
    // digest. Missing key (pre-migration rows), `false`, a missing blob, and the
    // legacy `digest` key all mean disabled.
    it('isDigestEnabled is opt-in: missing key → disabled', () => {
      expect(isDigestEnabled({})).toBe(false);
      expect(isDigestEnabled({ breaking: true, digest: true })).toBe(false);
      expect(isDigestEnabled(null)).toBe(false);
      expect(isDigestEnabled(undefined)).toBe(false);
      expect(isDigestEnabled("nope")).toBe(false);
    });

    it('isDigestEnabled returns false for watchlist_email === false', () => {
      expect(isDigestEnabled({ watchlist_email: false })).toBe(false);
      expect(isDigestEnabled({ watchlist_email: false, digest: true })).toBe(false);
    });

    it('isDigestEnabled returns true only for watchlist_email === true', () => {
      expect(isDigestEnabled({ watchlist_email: true })).toBe(true);
      expect(isDigestEnabled({ watchlist_email: true, digest: false })).toBe(true);
    });

    it('isDigestEnabled ignores non-boolean / legacy values', () => {
      expect(isDigestEnabled({ watchlist_email: "true" })).toBe(false);
      expect(isDigestEnabled({ watchlist_email: "yes" })).toBe(false);
      expect(isDigestEnabled({ watchlist_email: 1 })).toBe(false);
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
      vi.mocked(renderDigestSubject).mockReturnValue('Your weekly watchlist digest');
      vi.mocked(renderDigestHtml).mockReturnValue('<html>digest</html>');
      vi.mocked(renderDigestText).mockReturnValue('digest');
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

    // ── opt-in gate, end to end through the send pass ────────────────────────
    // A user with one pending alert but no explicit `watchlist_email: true`
    // must NOT be emailed (acceptance criterion: no new mail to non-opted-in
    // users). Covers the pre-migration blob (key missing) and explicit false.
    const pendingAlert = {
      id: "a1",
      user_id: "u1",
      signal_id: "s1",
      entity_id: "e1",
      signal_type: "earnings",
      score: 0.9,
      created_at: "2026-11-15T00:00:00Z",
    };

    function digestClient(
      prefs: { user_id: string; notification_prefs: unknown }[],
    ) {
      const updates: { table: string; payload: Record<string, unknown> }[] = [];
      const chain = (table: string): any => {
        const c: any = {
          select: () => c,
          is: () => c,
          gte: () => c,
          order: () => c,
          in: () => c,
          eq: () => c,
          update: (payload: Record<string, unknown>) => {
            updates.push({ table, payload });
            return c;
          },
          then: (resolve: any) =>
            Promise.resolve({
              data:
                table === "alert_events"
                  ? [pendingAlert]
                  : table === "user_preferences"
                    ? prefs
                    : table === "signals"
                      ? [{ id: "s1", summary: "x", content_id: "c1" }]
                      : table === "content"
                        ? [{ id: "c1", url: "https://example.com/a" }]
                        : [],
              error: null,
            }).then(resolve),
        };
        return c;
      };
      return {
        updates,
        client: {
          from: (table: string) => chain(table),
          auth: {
            admin: {
              getUserById: async () => ({
                data: { user: { email: "u1@example.com" } },
                error: null,
              }),
            },
          },
        },
      };
    }

    const digestPrefsRow = (
      notification_prefs: unknown,
      overrides: Record<string, unknown> = {},
    ) => ({
      user_id: "u1",
      notification_prefs,
      last_digest_sent_at: null as string | null,
      digest_unsub_token: "a".repeat(64),
      ...overrides,
    });

    it('does NOT email a legacy user whose prefs lack watchlist_email (opt-in)', async () => {
      const { client } = digestClient([digestPrefsRow({ breaking: true, digest: true })]);
      const result = await sendWeeklyDigests({
        supabase: client,
        now: new Date("2026-11-16T12:00:00Z"), // Monday
      });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.alertsEmailed).toBe(0);
    });

    it('does NOT email a user who explicitly disabled watchlist_email', async () => {
      const { client } = digestClient([
        digestPrefsRow({ watchlist_email: false, digest: true }),
      ]);
      const result = await sendWeeklyDigests({
        supabase: client,
        now: new Date("2026-11-16T12:00:00Z"),
      });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });

    it('emails a user who explicitly opted in with watchlist_email: true', async () => {
      const { client, updates } = digestClient([
        digestPrefsRow({ watchlist_email: true }),
      ]);
      const result = await sendWeeklyDigests({
        supabase: client,
        now: new Date("2026-11-16T12:00:00Z"),
      });
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
      expect(result.alertsEmailed).toBe(1);
      // Ledger stamped + cadence recorded only after the successful send.
      expect(
        updates.some(
          (u) => u.table === "alert_events" && "email_sent_at" in u.payload,
        ),
      ).toBe(true);
      expect(
        updates.some(
          (u) => u.table === "user_preferences" && "last_digest_sent_at" in u.payload,
        ),
      ).toBe(true);
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

    // Fetch-based Supabase stub good enough to drive a full digest send:
    // pending alerts + prefs + entity/signal/content lookups + update writes.
    function makeFullClient(
      pending: Record<string, unknown>[],
      prefs: Record<string, unknown>[],
      emailByUser: Record<string, string>,
    ) {
      const entities = [{ id: 'ent1', canonical_name: 'Acme Corp' }];
      const signals = [{ id: 'sig1', summary: 'Acme raises', content_id: 'c1' }];
      const content = [{ id: 'c1', url: 'https://example.com/a' }];
      const chain: any = {
        _table: '',
        _op: 'select',
        from(t: string) {
          chain._table = t;
          chain._op = 'select';
          return chain;
        },
        select() {
          return chain;
        },
        update() {
          chain._op = 'update';
          return chain;
        },
        eq() {
          return chain;
        },
        in() {
          return chain;
        },
        is() {
          return chain;
        },
        not() {
          return chain;
        },
        gte() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: any) {
          if (chain._op === 'update') return resolve({ data: null, error: null });
          switch (chain._table) {
            case 'alert_events':
              return resolve({ data: pending, error: null });
            case 'user_preferences':
              return resolve({ data: prefs, error: null });
            case 'entities':
              return resolve({ data: entities, error: null });
            case 'signals':
              return resolve({ data: signals, error: null });
            case 'content':
              return resolve({ data: content, error: null });
            default:
              return resolve({ data: [], error: null });
          }
        },
        auth: {
          admin: {
            getUserById: vi.fn((id: string) =>
              Promise.resolve({ data: { user: { email: emailByUser[id] } }, error: null }),
            ),
          },
        },
      };
      return chain;
    }

    const monday = new Date('2026-11-16T12:00:00Z');
    const pendingOne = [
      {
        id: 'ae1',
        user_id: 'u1',
        signal_id: 'sig1',
        entity_id: 'ent1',
        signal_type: 'earnings',
        score: 0.9,
        created_at: '2026-11-15T00:00:00Z',
      },
    ];
    const prefsOne = [
      {
        user_id: 'u1',
        notification_prefs: {},
        last_digest_sent_at: null,
        digest_unsub_token: 'a'.repeat(64),
      },
    ];

    it('warns once when DIGEST_FOOTER_ADDRESS is unset and a digest is about to be sent', async () => {
      mockGetDigestFooterAddress.mockReturnValue('');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const client = makeFullClient(pendingOne, prefsOne, { u1: 'user@example.com' });

      const result = await sendWeeklyDigests({ supabase: client, now: monday });

      expect(result.sent).toBe(1);
      const footerWarns = warnSpy.mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes('DIGEST_FOOTER_ADDRESS'),
      );
      expect(footerWarns).toHaveLength(1);
      warnSpy.mockRestore();
    });

    it('warns only once per run, not once per recipient', async () => {
      mockGetDigestFooterAddress.mockReturnValue('');
      const pendingTwo = [
        pendingOne[0],
        { ...pendingOne[0], id: 'ae2', user_id: 'u2' },
      ];
      const prefsTwo = [prefsOne[0], { ...prefsOne[0], user_id: 'u2', digest_unsub_token: 'b'.repeat(64) }];
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const client = makeFullClient(pendingTwo, prefsTwo, {
        u1: 'a@example.com',
        u2: 'b@example.com',
      });

      const result = await sendWeeklyDigests({ supabase: client, now: monday });

      expect(result.sent).toBe(2);
      const footerWarns = warnSpy.mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes('DIGEST_FOOTER_ADDRESS'),
      );
      expect(footerWarns).toHaveLength(1);
      warnSpy.mockRestore();
    });

    it('does not warn when the footer address is configured', async () => {
      mockGetDigestFooterAddress.mockReturnValue('123 Main St, Springfield');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const client = makeFullClient(pendingOne, prefsOne, { u1: 'user@example.com' });

      const result = await sendWeeklyDigests({ supabase: client, now: monday });

      expect(result.sent).toBe(1);
      const footerWarns = warnSpy.mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes('DIGEST_FOOTER_ADDRESS'),
      );
      expect(footerWarns).toHaveLength(0);
      warnSpy.mockRestore();
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

/**
 * Regression for the MEDIUM finding "token persist failure swallowed" on PR #133:
 * if generating and persisting a fresh `digest_unsub_token` fails, the email's
 * one-click unsubscribe link would 404 (the W9 route reads the token back from
 * `user_preferences`). The send must be aborted for that user instead.
 */
describe('sendWeeklyDigests — token persist failure', () => {
  const pendingAlert = {
    id: 'ev1',
    user_id: 'user-token-fail',
    signal_id: 'sig1',
    entity_id: 'ent1',
    signal_type: 'earnings',
    score: 0.9,
    created_at: '2026-11-15T00:00:00Z',
  };
  const prefRow = {
    user_id: 'user-token-fail',
    notification_prefs: {},
    last_digest_sent_at: null,
    digest_unsub_token: null, // forces token generation + persist
  };

  function buildMockSupabase(tokenPersistError: boolean): {
    client: { from: ReturnType<typeof vi.fn>; auth: { admin: { getUserById: ReturnType<typeof vi.fn> } } };
    updateCalls: { table: string; payload: Record<string, unknown> }[];
  } {
    const updateCalls: { table: string; payload: Record<string, unknown> }[] = [];
    const selectResults: Record<string, { data: unknown; error: null }> = {
      alert_events: { data: [pendingAlert], error: null },
      user_preferences: { data: [prefRow], error: null },
      entities: { data: [{ id: 'ent1', canonical_name: 'Acme Corp' }], error: null },
      signals: { data: [{ id: 'sig1', summary: 'Q3 beat', content_id: 'cont1' }], error: null },
      content: { data: [{ id: 'cont1', url: 'https://example.com/a' }], error: null },
    };

    const client = {
      from: vi.fn((table: string) => {
        // Thenable query stub: chainable methods return itself; awaiting it
        // resolves either the recorded select result or the update result.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = { _update: null as Record<string, unknown> | null };
        for (const m of ['select', 'eq', 'in', 'is', 'gte', 'not', 'order', 'limit']) {
          q[m] = vi.fn(() => q);
        }
        q.update = vi.fn((payload: Record<string, unknown>) => {
          q._update = payload;
          updateCalls.push({ table, payload });
          return q;
        });
        q.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        q.then = (resolve: (value: unknown) => void) => {
          if (q._update) {
            if (tokenPersistError && 'digest_unsub_token' in q._update) {
              resolve({ data: null, error: { message: 'simulated persist failure' } });
            } else {
              resolve({ data: null, error: null });
            }
          } else {
            resolve(selectResults[table] ?? { data: [], error: null });
          }
        };
        return q;
      }),
      auth: {
        admin: {
          getUserById: vi.fn(() =>
            Promise.resolve({ data: { user: { email: 'user@example.com' } }, error: null }),
          ),
        },
      },
    };
    return { client, updateCalls };
  }

  const mockGenerateDigestUnsubToken = vi.mocked(generateDigestUnsubToken);
  const mockBuildDigestUnsubUrl = vi.mocked(buildDigestUnsubUrl);
  const mockBuildDigestUnsubHeaders = vi.mocked(buildDigestUnsubHeaders);
  const mockGetDigestFooterAddress = vi.mocked(getDigestFooterAddress);
  const mockGetSiteUrl = vi.mocked(getSiteUrl);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateDigestUnsubToken.mockReturnValue('a'.repeat(64));
    mockBuildDigestUnsubUrl.mockImplementation(
      (token, baseUrl) => `${baseUrl ?? 'https://x'}/unsubscribe?token=${token}`,
    );
    mockBuildDigestUnsubHeaders.mockImplementation((token, baseUrl) => ({
      'List-Unsubscribe': `<${baseUrl ?? 'https://x'}/unsubscribe?token=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }));
    mockGetDigestFooterAddress.mockReturnValue('123 Main St');
    mockGetSiteUrl.mockReturnValue('https://terminal.always-scheming.com');
  });

  it('fails the send (no email, no stamps) when the token cannot be persisted', async () => {
    const { client, updateCalls } = buildMockSupabase(true);
    const send = vi.fn(() => Promise.resolve({ ok: true, id: 'msg_1' }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: client as never,
      sendEmailImpl: send as never,
      now: new Date('2026-11-16T12:00:00Z'), // Monday UTC
    });

    // AC1: counted as a failure, not a send.
    expect(result.usersConsidered).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.alertsEmailed).toBe(0);
    expect(send).not.toHaveBeenCalled();

    // The token persist was attempted, but neither the alert ledger nor the
    // cadence column was stamped — so the user is retried next Monday.
    const tokenPersists = updateCalls.filter((u) => 'digest_unsub_token' in u.payload);
    expect(tokenPersists).toHaveLength(1);
    const stamped = updateCalls.filter(
      (u) => 'email_sent_at' in u.payload || 'last_digest_sent_at' in u.payload,
    );
    expect(stamped).toEqual([]);

    // AC2: the error is logged with the user id, never the email address.
    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('user-token-fail');
    expect(logged).not.toContain('user@example.com');

    errorSpy.mockRestore();
  });

  it('control: sends and stamps when the token persist succeeds', async () => {
    const { client, updateCalls } = buildMockSupabase(false);
    const send = vi.fn(() => Promise.resolve({ ok: true, id: 'msg_1' }));

    const result = await sendWeeklyDigests({
      supabase: client as never,
      sendEmailImpl: send as never,
      now: new Date('2026-11-16T12:00:00Z'),
    });

    expect(result.failed).toBe(0);
    expect(result.sent).toBe(1);
    expect(result.alertsEmailed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);

    const stamped = updateCalls.filter(
      (u) => 'email_sent_at' in u.payload || 'last_digest_sent_at' in u.payload,
    );
    expect(stamped).toHaveLength(2);
  });
});
