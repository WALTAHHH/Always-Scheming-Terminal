import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAlertCandidates,
  fanOutAlerts,
  DEFAULT_WATCHLIST_MIN_SCORE,
  DEFAULT_DIGEST_MAX_USERS,
  DEFAULT_DIGEST_MAX_ELAPSED_MS,
  DEFAULT_DIGEST_MAX_PENDING_ROWS,
  isMondayUtc,
  isDigestDue,
  isDigestEnabled,
  sendWeeklyDigests,
  buildDigestAlerts,
  type SignalRow,
  type ContentTagRow,
  type WatchlistRow,
  type PrefRow,
  type AlertCandidate,
  type PendingAlertRow,
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
  digestRelevance: vi.fn((score: number) =>
    Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score * 100))) : 0,
  ),
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
      limit: vi.fn().mockReturnThis(),
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
      mockSupabase.limit.mockClear();
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
          limit: () => c,
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
        limit: function() { return this; },
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
        update(p?: Record<string, unknown>) {
          chain._op = 'update';
          chain._payload = p ?? null;
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
          if (chain._op === 'update') {
            // Atomic digest claim (atomic-claim fix): UPDATE user_preferences
            // SET last_digest_sent_at ... RETURNING user_id yields the claimed row.
            if (chain._table === 'user_preferences' && chain._payload && 'last_digest_sent_at' in chain._payload) {
              return resolve({ data: prefs.map((p: any) => ({ user_id: p.user_id })), error: null });
            }
            return resolve({ data: null, error: null });
          }
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
        notification_prefs: { watchlist_email: true },
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
    notification_prefs: { watchlist_email: true },
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
            } else if ('last_digest_sent_at' in q._update && table === 'user_preferences') {
              // Atomic digest claim: RETURNING user_id — report the claimed row.
              resolve({ data: [{ user_id: 'user-token-fail' }], error: null });
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

    // The token persist was attempted, and under the at-most-once design the
    // digest window is claimed and then released (nothing was delivered), so the
    // net cadence change is nil and the user is retried on the next pass. The
    // alert ledger is never stamped.
    const tokenPersists = updateCalls.filter((u) => 'digest_unsub_token' in u.payload);
    expect(tokenPersists).toHaveLength(1);
    expect(updateCalls.filter((u) => 'email_sent_at' in u.payload)).toEqual([]);
    const cadenceWrites = updateCalls.filter((u) => 'last_digest_sent_at' in u.payload);
    // Claim (stamped to `now`) followed by release (restored to the observed NULL).
    expect(cadenceWrites.length).toBeGreaterThanOrEqual(2);
    expect(cadenceWrites[cadenceWrites.length - 1].payload.last_digest_sent_at).toBeNull();

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

// ── user cap (card t_4e277fa2) ──────────────────────────────────────────────
//
// `sendWeeklyDigests` must bound how many users it processes per pass so the
// digest tail of the extract-signals cron can't run past `maxDuration`. These
// tests use a small hand-rolled fake Supabase (the generic mock above swallows
// every query into `undefined`) so the pending-alert set is actually seen.

function fakeDigestSupabase(opts: {
  pending: {
    id: string;
    user_id: string;
    signal_id: string;
    entity_id: string | null;
    signal_type: string;
    score: number;
    created_at: string | null;
  }[];
  prefs: {
    user_id: string;
    notification_prefs: unknown;
    last_digest_sent_at: string | null;
    digest_unsub_token: string | null;
  }[];
  entities?: { id: string; canonical_name: string }[];
  signals?: { id: string; summary: string; content_id: string }[];
  content?: { id: string; url: string }[];
}) {
  const recorded = {
    prefSelectUserIds: [] as string[][],
    alertStamps: [] as string[][],
    cadenceUpdates: [] as string[],
    tokenUpdates: [] as string[],
  };

  // Minimal PostgREST-style thenable: every chain method returns itself and
  // awaiting resolves to `result`.
  const chain = (
    result: { data: unknown; error: unknown },
    onIn?: (col: string, vals: string[]) => void,
    onUpdate?: (vals: Record<string, unknown>) => void,
  ) => {
    const c: Record<string, unknown> = {};
    const ret = () => c;
    for (const m of ['select', 'is', 'gte', 'lte', 'order', 'eq', 'not', 'limit']) {
      c[m] = ret;
    }
    c.in = (col: string, vals: string[]) => {
      onIn?.(col, vals);
      return c;
    };
    c.update = (vals: Record<string, unknown>) => {
      onUpdate?.(vals);
      return c;
    };
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return c;
  };

  const client = {
    from(table: string) {
      switch (table) {
        case 'alert_events':
          return {
            select: () => chain({ data: opts.pending, error: null }),
            update: () =>
              chain({ data: null, error: null }, (col, ids) => {
                if (col === 'id') recorded.alertStamps.push(ids);
              }),
          };
        case 'user_preferences':
          return {
            select: () =>
              chain({ data: opts.prefs, error: null }, (col, ids) => {
                if (col === 'user_id') recorded.prefSelectUserIds.push(ids);
              }),
            update: (vals: Record<string, unknown>) => {
              if ('last_digest_sent_at' in vals) {
                recorded.cadenceUpdates.push(vals.last_digest_sent_at as string);
                // Atomic digest claim: UPDATE ... RETURNING user_id → claimed rows.
                return chain({
                  data: opts.prefs.map((p) => ({ user_id: p.user_id })),
                  error: null,
                });
              }
              if ('digest_unsub_token' in vals) {
                recorded.tokenUpdates.push(vals.digest_unsub_token as string);
              }
              return chain({ data: null, error: null });
            },
          };
        case 'entities':
          return { select: () => chain({ data: opts.entities ?? [], error: null }) };
        case 'signals':
          return { select: () => chain({ data: opts.signals ?? [], error: null }) };
        case 'content':
          return { select: () => chain({ data: opts.content ?? [], error: null }) };
        default:
          return { select: () => chain({ data: [], error: null }) };
      }
    },
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: { user: { email: `${id}@example.com` } },
          error: null,
        })),
      },
    },
  };

  return { client: client as never, recorded };
}

const MONDAY = new Date('2026-11-16T12:00:00Z');
const CREATED_AT = '2026-11-15T12:00:00Z';

function pendingFor(userId: string) {
  return {
    id: `alert-${userId}`,
    user_id: userId,
    signal_id: 'sig1',
    entity_id: 'ent1',
    signal_type: 'earnings',
    score: 0.9,
    created_at: CREATED_AT,
  };
}

function prefsFor(userId: string) {
  return {
    user_id: userId,
    notification_prefs: { watchlist_email: true },
    last_digest_sent_at: null,
    digest_unsub_token: `tok-${userId}`,
  };
}

const DIGEST_LOOKUPS = {
  entities: [{ id: 'ent1', canonical_name: 'Acme Corp' }],
  signals: [{ id: 'sig1', summary: 'Acme beat earnings', content_id: 'cont1' }],
  content: [{ id: 'cont1', url: 'https://example.com/a' }],
};

describe('sendWeeklyDigests — per-pass user cap', () => {
  const mockGetDigestFooterAddress = vi.mocked(getDigestFooterAddress);
  const mockGetSiteUrl = vi.mocked(getSiteUrl);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDigestFooterAddress.mockReturnValue('123 Main St');
    mockGetSiteUrl.mockReturnValue('https://terminal.always-scheming.com');
  });

  it('defaults the cap to DEFAULT_DIGEST_MAX_USERS (200)', () => {
    expect(DEFAULT_DIGEST_MAX_USERS).toBe(200);
  });

  it('processes at most maxUsers users, deterministically in user_id order', async () => {
    const users = ['u3', 'u1', 'u5', 'u2', 'u4']; // deliberately shuffled
    const { client, recorded } = fakeDigestSupabase({
      pending: users.map(pendingFor),
      prefs: users.map(prefsFor),
      ...DIGEST_LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: client,
      now: MONDAY,
      sendEmailImpl: send as never,
      maxUsers: 2,
    });

    // 5 users considered, only 2 processed, 3 deferred.
    expect(result.skipped).toBe(null);
    expect(result.usersConsidered).toBe(5);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.alertsEmailed).toBe(2);
    expect(result.skippedByCap).toBe(3);

    // Deterministic: the two lowest user_ids win, regardless of input order.
    const recipients = send.mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(recipients).toEqual(['u1@example.com', 'u2@example.com']);

    // The prefs lookup is bounded to the processed users too.
    expect(recorded.prefSelectUserIds[0]).toEqual(['u1', 'u2']);
    // Only the processed users' alerts get stamped / get a cadence update.
    expect(recorded.alertStamps.flat().sort()).toEqual(['alert-u1', 'alert-u2']);
    expect(recorded.cadenceUpdates).toHaveLength(2);

    // Criterion 1 + 4: "stopping early" log line with considered/sent/skipped.
    const warnMsg = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warnMsg).toContain('stopping early');
    expect(warnMsg).toContain('2 of 5');
    const logMsg = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logMsg).toContain('5 users considered');
    expect(logMsg).toContain('2 sent');
    expect(logMsg).toContain('3 skipped by cap');

    warn.mockRestore();
    log.mockRestore();
  });

  it('uses the default cap of 200 when maxUsers is omitted', async () => {
    const users = Array.from({ length: 205 }, (_, i) => `u${String(i).padStart(3, '0')}`);
    const { client, recorded } = fakeDigestSupabase({
      pending: users.map(pendingFor),
      prefs: users.map(prefsFor),
      ...DIGEST_LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: client,
      now: MONDAY,
      sendEmailImpl: send as never,
    });

    expect(result.usersConsidered).toBe(205);
    expect(result.sent).toBe(200);
    expect(result.skippedByCap).toBe(5);
    expect(result.alertsEmailed).toBe(200);
    expect(send).toHaveBeenCalledTimes(200);
    // The first 200 by user_id ascending.
    expect(recorded.prefSelectUserIds[0]).toHaveLength(200);
    expect(recorded.prefSelectUserIds[0][0]).toBe('u000');
    expect(recorded.prefSelectUserIds[0][199]).toBe('u199');

    warn.mockRestore();
    log.mockRestore();
  });

  it('processes every user when maxUsers is 0 (uncapped)', async () => {
    const users = ['u1', 'u2', 'u3'];
    const { client } = fakeDigestSupabase({
      pending: users.map(pendingFor),
      prefs: users.map(prefsFor),
      ...DIGEST_LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: client,
      now: MONDAY,
      sendEmailImpl: send as never,
      maxUsers: 0,
    });

    expect(result.usersConsidered).toBe(3);
    expect(result.sent).toBe(3);
    expect(result.skippedByCap).toBe(0);
    expect(send).toHaveBeenCalledTimes(3);

    log.mockRestore();
  });

  it('does not defer anyone (skippedByCap 0) when the set is under the cap', async () => {
    const users = ['u1', 'u2'];
    const { client } = fakeDigestSupabase({
      pending: users.map(pendingFor),
      prefs: users.map(prefsFor),
      ...DIGEST_LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: client,
      now: MONDAY,
      sendEmailImpl: send as never,
      maxUsers: 10,
    });

    expect(result.usersConsidered).toBe(2);
    expect(result.sent).toBe(2);
    expect(result.skippedByCap).toBe(0);

    log.mockRestore();
  });

  // ── non-integer / out-of-range maxUsers (review feedback) ──────────────────
  // `slice(0, 0.5)` coerces to `slice(0, 0)` in JS, which would mail nobody at
  // all. The cap must be floored to an integer first, never used raw.

  it('floors a fractional maxUsers instead of silently processing zero users', async () => {
    const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const { client } = fakeDigestSupabase({
      pending: users.map(pendingFor),
      prefs: users.map(prefsFor),
      ...DIGEST_LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: client,
      now: MONDAY,
      sendEmailImpl: send as never,
      maxUsers: 2.7,
    });

    // 2.7 -> 2, not 0 and not 3.
    expect(result.usersConsidered).toBe(5);
    expect(result.sent).toBe(2);
    expect(result.skippedByCap).toBe(3);
    expect(send).toHaveBeenCalledTimes(2);

    const warnMsg = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warnMsg).toContain('2.7');
    expect(warnMsg).toContain('coercing to 2');
    expect(warnMsg).toContain('stopping early');

    warn.mockRestore();
    log.mockRestore();
  });

  it('treats a fractional maxUsers below 1 as uncapped (floors to 0), mailing everyone', async () => {
    const users = ['u1', 'u2', 'u3'];
    const { client } = fakeDigestSupabase({
      pending: users.map(pendingFor),
      prefs: users.map(prefsFor),
      ...DIGEST_LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: client,
      now: MONDAY,
      sendEmailImpl: send as never,
      maxUsers: 0.5,
    });

    // Must not be the old `slice(0, 0)` -> zero-recipient behaviour.
    expect(result.usersConsidered).toBe(3);
    expect(result.sent).toBe(3);
    expect(result.skippedByCap).toBe(0);
    expect(send).toHaveBeenCalledTimes(3);

    warn.mockRestore();
    log.mockRestore();
  });

  it.each([
    ['negative', -5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('treats a %s maxUsers as uncapped', async (_label, maxUsers) => {
    const users = ['u1', 'u2', 'u3'];
    const { client } = fakeDigestSupabase({
      pending: users.map(pendingFor),
      prefs: users.map(prefsFor),
      ...DIGEST_LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: client,
      now: MONDAY,
      sendEmailImpl: send as never,
      maxUsers,
    });

    expect(result.usersConsidered).toBe(3);
    expect(result.sent).toBe(3);
    expect(result.skippedByCap).toBe(0);
    expect(send).toHaveBeenCalledTimes(3);

    warn.mockRestore();
    log.mockRestore();
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
  /**
   * `false` mimics a PostgREST response with no `count` (a custom/mock client
   * that ignores `select(..., { count: 'exact' })`), so the "exact backlog
   * count unavailable" fallback can be exercised.
   */
  reportCount?: boolean;
}) {
  const reportCount = seed.reportCount ?? true;
  const state: Record<string, Array<Record<string, unknown>>> = {
    user_preferences: seed.prefs.map((p) => ({ ...p })),
    alert_events: seed.alerts.map((a) => ({ ...a })),
    entities: (seed.entities ?? []).map((e) => ({ ...e })),
    signals: (seed.signals ?? []).map((s) => ({ ...s })),
    content: (seed.content ?? []).map((c) => ({ ...c })),
  };
  // Every awaited `select`, with the shape the digest actually asked for — so a
  // test can assert the pending-alert read really carries a limit + ordering.
  const recordedSelects: Array<{
    table: string;
    limit: number | null;
    orders: string[];
    countRequested: boolean;
  }> = [];
  let failAlertStamp = false;

  // Postgres-ish `ORDER BY`: nulls last for ASC, then the id tiebreaker.
  function compareRows(
    orders: Array<{ column: string; ascending: boolean }>,
    a: Record<string, unknown>,
    b: Record<string, unknown>,
  ): number {
    for (const { column, ascending } of orders) {
      const av = a[column];
      const bv = b[column];
      if (av == null && bv == null) continue;
      if (av == null) return ascending ? 1 : -1;
      if (bv == null) return ascending ? -1 : 1;
      if (av < bv) return ascending ? -1 : 1;
      if (av > bv) return ascending ? 1 : -1;
    }
    return 0;
  }

  function makeBuilder(table: string): any {
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, unknown> | null = null;
    const preds: Array<(row: any) => boolean> = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let limitN: number | null = null;
    let countRequested = false;

    const builder: any = {
      select(_cols?: unknown, opts?: { count?: string }) {
        if (opts?.count === 'exact') countRequested = true;
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
      order(col: string, opts?: { ascending?: boolean }) {
        orders.push({ column: col, ascending: opts?.ascending !== false });
        return builder;
      },
      limit(n: number) {
        limitN = n;
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

        // PostgREST semantics: `count` is over the *filtered* set, before
        // ORDER BY / LIMIT; the page itself is ordered then limited.
        let page = matched.slice();
        if (orders.length) page.sort((a, b) => compareRows(orders, a, b));
        if (limitN != null) page = page.slice(0, limitN);
        recordedSelects.push({
          table,
          limit: limitN,
          orders: orders.map((o) => `${o.column}.${o.ascending ? 'asc' : 'desc'}`),
          countRequested,
        });
        resolve({
          data: page.map((r) => ({ ...r })),
          error: null,
          count: countRequested && reportCount ? matched.length : null,
        });
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
    recordedSelects,
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

// ─────────────────────────────────────────────────────────────────────────
// Pending-alert row bound (card t_0d9c0c7c).
//
// The per-pass user cap bounds the *work* per pass but not the pending-alert
// read itself: without a row bound a large backlog is materialised in full
// (loaded into memory, shipped from Postgres) before the cap can slice it,
// which is the cron tail's `maxDuration` risk. These tests drive the stateful
// fake backend — which now honours ORDER BY / LIMIT / `count: 'exact'` — with
// more rows than the bound.
// ─────────────────────────────────────────────────────────────────────────
describe('sendWeeklyDigests — pending-alert row bound', () => {
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

  const LOOKUPS = {
    entities: [{ id: 'ent1', canonical_name: 'Acme' }],
    signals: [{ id: 'sig1', summary: 'Acme beats estimates', content_id: 'cont1' }],
    content: [{ id: 'cont1', url: 'https://example.com/a' }],
  };

  function alertRow(userId: string, id: string, createdAt: string) {
    return {
      id,
      user_id: userId,
      signal_id: 'sig1',
      entity_id: 'ent1',
      signal_type: 'earnings',
      score: 0.9,
      created_at: createdAt,
      email_sent_at: null,
    };
  }

  const idsIn = (rows: Array<Record<string, unknown>>) =>
    rows.map((r) => r.id as string).sort();

  const stampedIds = (backend: ReturnType<typeof makeFakeBackend>) =>
    idsIn(backend.state.alert_events.filter((r) => r.email_sent_at != null));

  const pendingIds = (backend: ReturnType<typeof makeFakeBackend>) =>
    idsIn(backend.state.alert_events.filter((r) => r.email_sent_at == null));

  /** The digest's pending-alert read, as the query actually shaped it. */
  function pendingSelect(backend: ReturnType<typeof makeFakeBackend>) {
    const reads = backend.recordedSelects.filter((s) => s.table === 'alert_events');
    expect(reads).toHaveLength(1);
    return reads[0];
  }

  /** `n` users, one alert each, oldest first (u1 oldest). */
  function oneEach(users: string[]) {
    return users.map((u, i) =>
      alertRow(u, `al-${u}`, `2026-11-15T${String(i).padStart(2, '0')}:00:00Z`),
    );
  }

  it('defaults the row bound to DEFAULT_DIGEST_MAX_PENDING_ROWS (5000)', () => {
    expect(DEFAULT_DIGEST_MAX_PENDING_ROWS).toBe(5000);
  });

  it('limits the pending-alert read and stamps nothing beyond the bound', async () => {
    const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const backend = makeFakeBackend({
      prefs: users.map(prefsFor),
      alerts: oneEach(users),
      ...LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      maxPendingRows: 3,
    });

    // The read is bounded to 3 of the 5 pending rows — the 2 newest are left.
    expect(result.pendingRowsRead).toBe(3);
    expect(result.pendingRowsTruncated).toBe(2);
    expect(result.usersConsidered).toBe(3);
    expect(result.sent).toBe(3);
    expect(result.alertsEmailed).toBe(3);

    // The query carried the bound, the FIFO order, and the id tiebreaker.
    const pending = pendingSelect(backend);
    expect(pending.limit).toBe(3);
    expect(pending.orders).toEqual(['created_at.asc', 'id.asc']);
    expect(pending.countRequested).toBe(true);

    // Nothing past the bound was stamped: those rows stay pending.
    expect(stampedIds(backend)).toEqual(['al-u1', 'al-u2', 'al-u3']);
    expect(pendingIds(backend)).toEqual(['al-u4', 'al-u5']);

    // AC#3: the truncated row count is on the pass log line.
    const logMsg = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logMsg).toContain('3 users considered');
    expect(logMsg).toContain('3 sent');
    expect(logMsg).toContain(
      '2 pending rows truncated by the row bound (3 read, maxPendingRows=3)',
    );

    log.mockRestore();
  });

  it('picks up the rows the bound deferred on the next pass (no data loss)', async () => {
    const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const backend = makeFakeBackend({
      prefs: users.map(prefsFor),
      alerts: oneEach(users),
      ...LOOKUPS,
    });
    const send = vi.fn(async (_msg: { to: string }) => ({ ok: true, id: 'msg' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const first = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      maxPendingRows: 3,
    });
    expect(first.pendingRowsRead).toBe(3);
    expect(first.pendingRowsTruncated).toBe(2);

    // The cron's next self-chained invocation reads exactly what the bound left
    // behind — nothing was stamped for it, so nothing was lost.
    const second = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      maxPendingRows: 3,
    });
    expect(second.pendingRowsRead).toBe(2);
    expect(second.pendingRowsTruncated).toBe(0);
    expect(second.usersConsidered).toBe(2);
    expect(second.sent).toBe(2);
    expect(second.skippedByCap).toBe(0);

    // Every pending row was eventually stamped, in user_id order.
    expect(pendingIds(backend)).toEqual([]);
    expect(stampedIds(backend)).toEqual(['al-u1', 'al-u2', 'al-u3', 'al-u4', 'al-u5']);
    expect(send.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual([
      'u1@example.com',
      'u2@example.com',
      'u3@example.com',
      'u4@example.com',
      'u5@example.com',
    ]);

    log.mockRestore();
  });

  it('selects the same rows when created_at ties, whatever the input order', async () => {
    // One fan-out batch stamps every row with the same `created_at`, so the
    // ordering needs the `id` tiebreaker to pin the `.limit()` cut-off down.
    const tied = '2026-11-15T00:00:00Z';
    const newer = '2026-11-16T00:00:00Z';
    const seedFor = (order: string[]) =>
      makeFakeBackend({
        prefs: order.map(prefsFor),
        alerts: order.map((u) => alertRow(u, `al-${u}`, u === 'u4' ? newer : tied)),
        ...LOOKUPS,
      });

    const runPass = async (backend: ReturnType<typeof makeFakeBackend>) => {
      const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await sendWeeklyDigests({
        supabase: backend.client,
        now,
        sendEmailImpl: send as never,
        maxPendingRows: 2,
      });
      log.mockRestore();
      return result;
    };

    // Same database state, two different row orders out of the fake store.
    const backendA = seedFor(['u3', 'u4', 'u1', 'u2']);
    const backendB = seedFor(['u2', 'u1', 'u4', 'u3']);
    const resA = await runPass(backendA);
    const resB = await runPass(backendB);

    // Both passes serve the same two users, chosen by (created_at, id) — not by
    // whatever order the rows happened to come back in.
    expect(stampedIds(backendA)).toEqual(['al-u1', 'al-u2']);
    expect(stampedIds(backendB)).toEqual(['al-u1', 'al-u2']);
    expect(resA.usersConsidered).toBe(2);
    expect(resB.usersConsidered).toBe(2);
    expect(resA.pendingRowsTruncated).toBe(2);
    expect(resB.pendingRowsTruncated).toBe(2);
  });

  it('treats maxPendingRows 0 as uncapped (escape hatch)', async () => {
    const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const backend = makeFakeBackend({
      prefs: users.map(prefsFor),
      alerts: oneEach(users),
      ...LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      maxPendingRows: 0,
    });

    expect(result.pendingRowsRead).toBe(5);
    expect(result.pendingRowsTruncated).toBe(0);
    expect(result.sent).toBe(5);
    // No LIMIT is applied to the query at all in this mode.
    expect(pendingSelect(backend).limit).toBeNull();

    log.mockRestore();
  });

  it('floors a fractional maxPendingRows instead of reading zero rows', async () => {
    const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const backend = makeFakeBackend({
      prefs: users.map(prefsFor),
      alerts: oneEach(users),
      ...LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      maxPendingRows: 2.7,
    });

    // 2.7 -> 2, not 0 (`.limit(0.5)` would read nothing at all).
    expect(result.pendingRowsRead).toBe(2);
    expect(result.pendingRowsTruncated).toBe(3);
    expect(result.sent).toBe(2);
    expect(pendingSelect(backend).limit).toBe(2);

    const warnMsg = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warnMsg).toContain('maxPendingRows=2.7');
    expect(warnMsg).toContain('coercing to 2');

    warn.mockRestore();
    log.mockRestore();
  });

  it('reports an unknown truncation count when the server returns no count', async () => {
    const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const backend = makeFakeBackend({
      prefs: users.map(prefsFor),
      alerts: oneEach(users),
      ...LOOKUPS,
      reportCount: false,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      maxPendingRows: 3,
    });

    // The read still stopped at the bound; only the exact backlog is unknown.
    expect(result.pendingRowsRead).toBe(3);
    expect(result.pendingRowsTruncated).toBeNull();
    expect(stampedIds(backend)).toEqual(['al-u1', 'al-u2', 'al-u3']);
    const logMsg = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logMsg).toContain(
      'at least 1 pending rows truncated by the row bound (3 read, maxPendingRows=3)',
    );

    log.mockRestore();
  });

  it('applies the default 5000-row bound to a larger backlog', async () => {
    // 10 users x 600 alerts = 6000 pending rows, interleaved so the FIFO window
    // spans every user (the real "large backlog" shape).
    const users = Array.from({ length: 10 }, (_, i) => `u${String(i + 1).padStart(2, '0')}`);
    const alerts: Array<Record<string, unknown> & { id: string }> = [];
    for (let i = 0; i < 600; i += 1) {
      const createdAt = new Date(Date.UTC(2026, 10, 10, 0, 0, i)).toISOString();
      for (const u of users) {
        alerts.push(alertRow(u, `al-${u}-${String(i).padStart(3, '0')}`, createdAt));
      }
    }
    expect(alerts).toHaveLength(6000);

    const backend = makeFakeBackend({
      prefs: users.map(prefsFor),
      alerts,
      ...LOOKUPS,
    });
    const send = vi.fn(async () => ({ ok: true, id: 'msg' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
    });

    expect(pendingSelect(backend).limit).toBe(5000);
    expect(result.pendingRowsRead).toBe(5000);
    expect(result.pendingRowsTruncated).toBe(1000);
    expect(result.usersConsidered).toBe(10);
    expect(result.sent).toBe(10);
    expect(result.alertsEmailed).toBe(5000);
    expect(stampedIds(backend)).toHaveLength(5000);
    expect(pendingIds(backend)).toHaveLength(1000);

    const logMsg = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logMsg).toContain(
      '1000 pending rows truncated by the row bound (5000 read, maxPendingRows=5000)',
    );

    log.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Wall-clock budget (card t_68c356d3): a slow pass must stop *before* it
// starts another user's claim, leaving the un-attempted users for the next
// Monday. The user cap bounds how many users a pass attempts, not how long
// they take; this budget is what actually keeps the cron tail under
// `maxDuration` when the transport is slow.
// ─────────────────────────────────────────────────────────────────────────
describe('sendWeeklyDigests — wall-clock budget', () => {
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

  const LOOKUPS = {
    entities: [{ id: 'ent1', canonical_name: 'Acme' }],
    signals: [{ id: 'sig1', summary: 'Acme beats estimates', content_id: 'cont1' }],
    content: [{ id: 'cont1', url: 'https://example.com/a' }],
  };

  function alertRow(userId: string, id: string, createdAt: string) {
    return {
      id,
      user_id: userId,
      signal_id: 'sig1',
      entity_id: 'ent1',
      signal_type: 'earnings',
      score: 0.9,
      created_at: createdAt,
      email_sent_at: null,
    };
  }

  const idsIn = (rows: Array<Record<string, unknown>>) =>
    rows.map((r) => r.id as string).sort();

  const stampedIds = (backend: ReturnType<typeof makeFakeBackend>) =>
    idsIn(backend.state.alert_events.filter((r) => r.email_sent_at != null));

  const pendingIds = (backend: ReturnType<typeof makeFakeBackend>) =>
    idsIn(backend.state.alert_events.filter((r) => r.email_sent_at == null));

  /** `n` users, one alert each, oldest first (u1 oldest). */
  function oneEach(users: string[]) {
    return users.map((u, i) =>
      alertRow(u, `al-${u}`, `2026-11-15T${String(i).padStart(2, '0')}:00:00Z`),
    );
  }

  it('defaults the budget to DEFAULT_DIGEST_MAX_ELAPSED_MS (60 s)', () => {
    expect(DEFAULT_DIGEST_MAX_ELAPSED_MS).toBe(60_000);
  });

  // (a) A pass with an injected slow send stops at the budget with the
  // remaining users unstamped — not lost.
  it('stops at the budget with the remaining users unstamped, not lost', async () => {
    const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const backend = makeFakeBackend({
      prefs: users.map(prefsFor),
      alerts: oneEach(users),
      ...LOOKUPS,
    });

    // Controllable clock: each send advances it by 100 ms.
    let clock = 0;
    const send = vi.fn(async () => {
      clock += 100;
      return { ok: true, id: 'msg' };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      nowMs: () => clock,
      maxElapsedMs: 250,
    });

    // 100 ms per send, 250 ms budget: u1 (0→100), u2 (100→200), u3 (200→300),
    // then the check before u4 sees 300 >= 250 and breaks.
    expect(result.usersConsidered).toBe(5);
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.alertsEmailed).toBe(3);
    expect(result.skippedByBudget).toBe(2);
    expect(result.skippedByCap).toBe(0);
    expect(send).toHaveBeenCalledTimes(3);

    // The two deferred users are untouched: alerts still pending, never claimed.
    expect(stampedIds(backend)).toEqual(['al-u1', 'al-u2', 'al-u3']);
    expect(pendingIds(backend)).toEqual(['al-u4', 'al-u5']);
    const claimed = backend.state.user_preferences
      .filter((p) => p.last_digest_sent_at != null)
      .map((p) => p.user_id)
      .sort();
    expect(claimed).toEqual(['u1', 'u2', 'u3']);

    const warnMsg = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(warnMsg).toContain('stopping early');
    expect(warnMsg).toContain('wall-clock budget of 250ms reached after 3 of 5 users');
    expect(warnMsg).toContain('2 deferred');
    const logMsg = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logMsg).toContain('2 skipped by budget');

    warn.mockRestore();
    log.mockRestore();
  });

  // (b) A second pass picks the deferred users up.
  it('lets a second pass pick up the users the budget deferred', async () => {
    const users = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const backend = makeFakeBackend({
      prefs: users.map(prefsFor),
      alerts: oneEach(users),
      ...LOOKUPS,
    });

    let clock = 0;
    const send = vi.fn(async () => {
      clock += 100;
      return { ok: true, id: 'msg' };
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const first = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      nowMs: () => clock,
      maxElapsedMs: 250,
    });
    expect(first.sent).toBe(3);
    expect(first.skippedByBudget).toBe(2);

    // Second pass, fresh budget: only u4/u5 still have pending alerts (u1-u3
    // were stamped) and both are due again (they were never claimed).
    clock = 0;
    const second = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      nowMs: () => clock,
      maxElapsedMs: 250,
    });

    expect(second.usersConsidered).toBe(2);
    expect(second.sent).toBe(2);
    expect(second.skippedByBudget).toBe(0);
    // Nothing lost, nothing duplicated: all five alerts now stamped exactly once.
    expect(stampedIds(backend)).toEqual([
      'al-u1',
      'al-u2',
      'al-u3',
      'al-u4',
      'al-u5',
    ]);
    expect(pendingIds(backend)).toEqual([]);

    log.mockRestore();
  });

  // (c) A budget breach never releases a claim mid-flight: every user that was
  // claimed is also fully delivered (claim implies stamped alert).
  it('does not release a claim mid-flight when the budget is breached', async () => {
    const users = ['u1', 'u2', 'u3', 'u4'];
    const backend = makeFakeBackend({
      prefs: users.map(prefsFor),
      alerts: oneEach(users),
      ...LOOKUPS,
    });

    // Send advances the clock past the budget *during* u2's send, so the breach
    // is observed on the check before u3 — u2 must still complete normally.
    let clock = 0;
    const send = vi.fn(async () => {
      clock += 100;
      return { ok: true, id: 'msg' };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendWeeklyDigests({
      supabase: backend.client,
      now,
      sendEmailImpl: send as never,
      nowMs: () => clock,
      maxElapsedMs: 150,
    });

    // u1 (0→100) processed; check before u2: 100 < 150 → u2 processed (100→200);
    // check before u3: 200 >= 150 → break. u2 finished, no partial state.
    expect(result.sent).toBe(2);
    expect(result.skippedByBudget).toBe(2);

    // Invariant: claimed ⇔ stamped. A mid-flight release would leave a claimed
    // user with an unstamped alert (or a released claim), breaking this.
    const claimedUsers = backend.state.user_preferences
      .filter((p) => p.last_digest_sent_at != null)
      .map((p) => p.user_id)
      .sort();
    const stampedUsers = Array.from(
      new Set(
        backend.state.alert_events
          .filter((r) => r.email_sent_at != null)
          .map((r) => r.user_id as string),
      ),
    ).sort();
    expect(claimedUsers).toEqual(['u1', 'u2']);
    expect(stampedUsers).toEqual(['u1', 'u2']);
    expect(stampedIds(backend)).toEqual(['al-u1', 'al-u2']);

    warn.mockRestore();
    log.mockRestore();
  });
});

describe('buildDigestAlerts', () => {
  const alert: PendingAlertRow = {
    id: 'al-1',
    user_id: 'u1',
    signal_id: 'sig-1',
    entity_id: 'ent-1',
    signal_type: 'acquisition',
    score: 0.9,
    created_at: '2026-11-17T09:00:00.000Z',
  };

  it('resolves the entity name, article url and source name', () => {
    const out = buildDigestAlerts(
      [alert],
      [{ id: 'ent-1', canonical_name: 'Acme Games' }],
      [{ id: 'sig-1', summary: 'Acme acquires Pixel Forge.', content_id: 'c-1' }],
      [{ id: 'c-1', url: 'https://news.example.com/story', source_name: 'The Game Business' }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      entityName: 'Acme Games',
      summary: 'Acme acquires Pixel Forge.',
      url: 'https://news.example.com/story',
      sourceName: 'The Game Business',
      createdAt: '2026-11-17T09:00:00.000Z',
    });
  });

  it('carries ticker, is_public, the content title/published date and a numeric relevance', () => {
    const out = buildDigestAlerts(
      [alert],
      [
        {
          id: 'ent-1',
          canonical_name: 'Acme Games',
          ticker: 'ACME',
          is_public: true,
        },
      ],
      [{ id: 'sig-1', summary: 'Acme acquires Pixel Forge.', content_id: 'c-1' }],
      [
        {
          id: 'c-1',
          url: 'https://news.example.com/story',
          title: 'Acme Games acquires Pixel Forge for $120M',
          published_at: '2026-11-17T08:30:00.000Z',
          source_name: 'The Game Business',
        },
      ],
    );
    expect(out[0]).toMatchObject({
      entityName: 'Acme Games',
      ticker: 'ACME',
      isPublic: true,
      title: 'Acme Games acquires Pixel Forge for $120M',
      publishedAt: '2026-11-17T08:30:00.000Z',
      // 0.9 -> 90, the reader-facing relevance integer
      relevance: 90,
    });
  });

  it('leaves ticker/isPublic/title/publishedAt null when the rows do not provide them', () => {
    const out = buildDigestAlerts(
      [alert],
      [{ id: 'ent-1', canonical_name: 'Acme Games' }],
      [{ id: 'sig-1', summary: 'Acme acquires Pixel Forge.', content_id: 'c-1' }],
      [{ id: 'c-1', url: 'https://news.example.com/story' }],
    );
    expect(out[0].ticker).toBeNull();
    expect(out[0].isPublic).toBeNull();
    expect(out[0].title).toBeNull();
    expect(out[0].publishedAt).toBeNull();
    // relevance is always derived from the score, never missing.
    expect(out[0].relevance).toBe(90);
  });

  it('leaves sourceName null when the content row has no source name', () => {
    const out = buildDigestAlerts(
      [alert],
      [{ id: 'ent-1', canonical_name: 'Acme Games' }],
      [{ id: 'sig-1', summary: 'Acme acquires Pixel Forge.', content_id: 'c-1' }],
      [{ id: 'c-1', url: 'https://news.example.com/story' }],
    );
    expect(out[0].sourceName).toBeNull();
  });
});
