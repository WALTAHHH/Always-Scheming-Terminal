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

// Mock email module to isolate digest tests
vi.mock('./email', () => ({
  getEmailConfig: vi.fn(),
  sendEmail: vi.fn(),
  generateDigestUnsubToken: vi.fn(),
  buildDigestUnsubUrl: vi.fn(),
  buildDigestUnsubHeaders: vi.fn(),
  getDigestFooterAddress: vi.fn(),
  getSiteUrl: vi.fn(),
}));

  type ContentTagRow,
  type WatchlistRow,
  type PrefRow,
} from './alerts';

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
    // We'll add tests later
    it('placeholder', () => {
      expect(true).toBe(true);
    });
  });

});
