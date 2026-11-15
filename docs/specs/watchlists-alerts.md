# Watchlists + Alerts — Design Spec (v1)

Status: **draft for review** · Owner: Matt · Author: Wolo (coder) · Target: beta retention
Scope: design only. No application code, no migrations applied. All SQL below is a draft.

---

## 0. Problem & goal

Beta users currently have no reason to come *back*. The feed is pull-only: nothing
tells a user that something happened to a company they care about.

**Goal:** let a user *follow* entities (companies) and be notified when a
high-importance signal lands on a followed entity. Success = an inert feed
becomes a pull loop ("something I follow moved → I open AST").

---

## 1. Grounding — what exists today

Everything in this spec is built on the tables and crons already in the repo.

### 1.1 Relevant tables

| Table | Key columns | Notes |
|---|---|---|
| `content` | `id`, `title`, `url`, `published_at`, `tags jsonb`, `importance_score float`, `signals_extracted_at` | `importance_score` added in `supabase/migrations/013_importance_score.sql`; written by the ingest pipeline. |
| `signals` | `id`, `content_id → content(id)`, `signal_type`, `summary`, `investment_relevance_score float 0..1`, `created_at` | 9 fixed `signal_type`s (`acquisition, fundraising, earnings, layoffs, leadership, product_launch, regulatory, platform_change, macro`). FK renamed `item_id → content_id` in `014_signals_rename_item_id.sql`. |
| `content_tags` | `content_id`, `dimension`, `value`, `confidence`, `entity_id → entities(id)` | `dimension='company'` rows with non-null `entity_id` are the entity link. `entity_id` added in `012_fix_stale_migration_refs.sql`. This is the join path signals → entities. |
| `entities` | `id`, `canonical_name`, `entity_type`, `ticker`, `exchange`, `is_public`, `parent_id`, `segment` | `segment` + `ir_url`/`sec_url` added in `010_entities_ir_fields.sql`. `parent_id` models subsidiaries. |
| `entity_aliases` | `entity_id`, `alias`, `alias_type` | One alias → one entity (`UNIQUE(alias)`). |
| `profiles` | `id → auth.users(id)`, `display_name`, `role`, `subscription_tier` | Auto-created by `handle_new_user()`. |
| `user_preferences` | `user_id UNIQUE → auth.users(id)`, `interests text[]`, `segments text[]`, `notification_prefs jsonb` (default `{"digest":false,"breaking":false}`), `digest_frequency` (`off`/`daily`/`weekly`), `theme` | Auto-created by `handle_new_profile()`. Read/written by `src/app/api/user/preferences/route.ts`. |

### 1.2 Two different "importance" notions already exist — pick one

This is the single most important reconciliation in the spec:

1. **`signals.investment_relevance_score`** — LLM-scored 0..1 per signal
   (`gemini-2.5-flash-lite` in `src/app/api/admin/extract-signals/route.ts`).
   The cron **already discards anything `< 0.65`** (line ~293), so every row in
   `signals` is already "high relevance". This is per-signal, per-event.
2. **`content.importance_score`** — rule-based 0..1 per *article/cluster*, computed
   by `src/lib/importance.ts` (`scoreItem`/`scoreCluster`). Tier cutoffs there:
   `critical ≥ 0.65`, `high ≥ 0.45`, `medium ≥ 0.25`.

**Decision for v1:** alert on **`signals.investment_relevance_score`** (the field that
gates signal creation and is what the Signal panel already shows as "confidence"),
and expose a per-user threshold with a default of `0.65` (i.e. "all signals", tunable
upward). `content.importance_score` is *not* used for v1 triggers because it is
article-level and its ingest-time population is inconsistent; it can be added later as
a secondary boost. → **Open question Q1 for Matt.**

### 1.3 Pipeline shape (where the hook goes)

- Vercel crons (`vercel.json`): `POST /api/ingest` @ `08:00 UTC`, `POST /api/admin/extract-signals` @ `08:15 UTC`.
- `extract-signals` selects `content` rows with `signals_extracted_at IS NULL`,
  runs Gemini, applies dedup + the 0.65 floor, inserts into `signals`, marks the
  content row processed, and **self-chains** (fires itself again) while rows remain.
- Cron auth is the `x-vercel-cron: 1` header (see `decisions.md`) — **not** `requireAdmin`.
- Vercel **Hobby** allows **max 2 cron jobs**, daily granularity, approximate timing.
  Both slots are already used. → v1 must **not** add a third cron; alert fan-out and
  the digest must ride on the existing `extract-signals` invocation.

---

## 2. Data model

### 2.1 Reuse vs. new — the `user_preferences.segments` question

`user_preferences.segments text[]` holds **segment names** (the 9 coarse buckets from
`docs/company-list-v1.md`, rendered as checkboxes on `/profile`), e.g.
`"Platform Holders & Big Tech"`. There is **no per-entity follow** anywhere today.

**Recommendation: add a new `watchlists` table; leave `segments` untouched.**

Rationale:
- `segments` is a coarse, human-authored bucket list with no FK to `entities`
  (`entities.segment` exists but the profile segments are free-text names, and the
  two are not guaranteed to agree). Overloading it to mean "follow these companies"
  would need a mapping layer and would change the meaning of an existing,
  user-visible control.
- Watchlists are inherently **entity-id keyed** — every downstream join
  (`content_tags.entity_id`) is by id, not by name.
- `segments` stays as an *onboarding hint*; a later card can auto-suggest
  "watch the top entities in your segments".

> Segment-level alerts ("notify me about anything in *Major Asian Publishers*") are a
> **later** feature, deliberately out of v1. → **Open question Q6.**

### 2.2 Proposed tables

Three tables: `watchlists` (the follow), `alert_events` (the per-user dedup ledger +
unread badge source). A third `alert_deliveries` (email send ledger) is stubbed for
the digest but can be folded into `alert_events` for v1 (see §3).

**Draft migration `supabase/migrations/018_watchlists_and_alerts.sql`:**

```sql
-- 018: Watchlists + alerts
-- Per-entity follows and the per-user alert ledger (dedup + unread badge source).

-- ── watchlists ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id   uuid NOT NULL REFERENCES entities(id)  ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, entity_id)          -- idempotent follow; one row per pair
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user   ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_entity ON watchlists(entity_id);

-- RLS: same pattern as user_preferences — owner-only, all verbs.
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own watchlists"
  ON watchlists FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── alert_events ──────────────────────────────────────────────
-- One row per (user, signal) a user should be told about. The UNIQUE constraint
-- is the dedup guarantee: a user is alerted at most once per signal, ever.
CREATE TABLE IF NOT EXISTS alert_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id         uuid NOT NULL REFERENCES signals(id)   ON DELETE CASCADE,
  -- which watch triggered it (nullable: watch may be removed later)
  watchlist_id      uuid REFERENCES watchlists(id) ON DELETE SET NULL,
  entity_id         uuid REFERENCES entities(id)   ON DELETE SET NULL,
  signal_type       text NOT NULL,
  score             numeric NOT NULL,        -- snapshot of investment_relevance_score
  created_at        timestamptz DEFAULT now(),
  read_at           timestamptz,             -- NULL = unread (drives the badge)
  email_sent_at     timestamptz,             -- NULL = not yet in a digest
  UNIQUE (user_id, signal_id)                -- ← dedup: never twice for the same signal
);

CREATE INDEX IF NOT EXISTS idx_alert_events_user_unread
  ON alert_events(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alert_events_email
  ON alert_events(user_id, created_at DESC) WHERE email_sent_at IS NULL;

-- RLS: users read/mark-read their own alerts. Inserts arrive via the service role
-- (which bypasses RLS), so no INSERT policy is needed for end users.
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own alerts"
  ON alert_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users mark own alerts read"
  ON alert_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── per-user threshold ────────────────────────────────────────
-- Extend the existing table rather than add a new one.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS watchlist_min_score numeric NOT NULL DEFAULT 0.65;
```

**Why two tables and not one:** `watchlists` is the durable follow list (many-to-many
user↔entity); `alert_events` is an append-only, write-once log with strict per-user
dedup and read state. Folding them together would key a follow to a signal and lose
the "unread count" semantics.

### 2.3 `notification_prefs` reuse

`user_preferences.notification_prefs jsonb` already defaults to
`{"digest": false, "breaking": false}` and is round-tripped opaquely by
`/api/user/preferences`. v1 extends it in place (no route change needed) with:

```json
{ "digest": false, "breaking": false, "watchlist_email": false }
```

`watchlist_email` gates the daily digest; `watchlist_min_score` (typed column, §2.2)
gates which signals qualify. Keeping the numeric threshold as a **typed column** means
the fan-out query can filter in SQL; the boolean channel toggle stays in the blob
because it is only read at send time.

### 2.4 Types

`src/lib/database.types.ts` is hand-maintained. Add `watchlists` and `alert_events`
Rows/Insert/Update blocks plus convenience aliases (`Watchlist`, `AlertEvent`), and
add `watchlist_min_score: number` to the `user_preferences` blocks.

---

## 3. Trigger logic

### 3.1 What fires

A signal `S` (newly inserted by the extract-signals cron) fires an alert for user `U`
when **all** hold:

1. `S` links (via `content_tags` where `dimension='company'` and `entity_id IS NOT NULL`)
   to an `entity_id` present in `U`'s `watchlists`.
2. `S.investment_relevance_score >= COALESCE(U.watchlist_min_score, 0.65)`.
3. No `alert_events` row already exists for `(U.id, S.id)` — enforced by `UNIQUE`.

Note the signal→entity link **already exists**: the same `content_tags.entity_id` join
is used for dedup in `extract-signals` today (see `checkDuplicateSignal`), so no new
extraction work is required.

### 3.2 Fan-out query (draft, idempotent)

```sql
-- Given the ids of signals just inserted in this cron run.
INSERT INTO alert_events
  (user_id, signal_id, watchlist_id, entity_id, signal_type, score)
SELECT DISTINCT ON (w.user_id, s.id)
       w.user_id, s.id, w.id, ct.entity_id, s.signal_type, s.investment_relevance_score
FROM   signals s
JOIN   content_tags ct
         ON ct.content_id = s.content_id
        AND ct.dimension  = 'company'
        AND ct.entity_id IS NOT NULL
JOIN   watchlists w  ON w.entity_id = ct.entity_id
JOIN   user_preferences p ON p.user_id = w.user_id
WHERE  s.id = ANY($1)                                       -- ids from this run
  AND  s.investment_relevance_score >= COALESCE(p.watchlist_min_score, 0.65)
ORDER  BY w.user_id, s.id, w.id                              -- deterministic pick
ON CONFLICT (user_id, signal_id) DO NOTHING;                 -- ← dedup
```

`DISTINCT ON (w.user_id, s.id)` ensures **one alert per user per signal even if the
user watches two companies named in the same article**; the `ON CONFLICT DO NOTHING`
makes re-runs safe (the cron self-chains, so idempotency is mandatory).

### 3.3 Where it hooks in

In `src/app/api/admin/extract-signals/route.ts`, after the insert loop:
collect the ids of signals inserted in this invocation, then call the fan-out
(implemented as a lib function `fanOutAlerts(signalIds)` in a new `src/lib/alerts.ts`
that issues the insert above). It runs **inside the existing cron invocation**, so no
new cron slot is used (critical on Hobby).

Alternative considered: a Postgres trigger on `INSERT INTO signals`. Rejected for v1 —
it would need to reach `user_preferences`/`watchlists` per row and is harder to unit
test with Vitest; the cron-tail function is plain TypeScript and testable.

### 3.4 Dedup — two layers, both required

- **Layer 1 (event):** `alert_events.UNIQUE(user_id, signal_id)` + `ON CONFLICT DO
  NOTHING`. Guarantees "a user never gets the same *event* twice".
- **Layer 2 (send):** `alert_events.email_sent_at` set when the digest including that
  row is actually sent. A signal qualifying but not yet emailed in a given day is
  picked up by the next digest; an already-emailed row is never resent.

This is distinct from the *signal-level* dedup already in the cron (company/Jaccard
summary dedup), which prevents duplicate `signals` rows in the first place.

### 3.5 Read/unread

`read_at IS NULL` = unread. The badge count is
`SELECT count(*) FROM alert_events WHERE user_id = $me AND read_at IS NULL`.

---

## 4. Delivery channels — v1 recommendation

### 4.1 Comparison

| Option | Cost (beta: <50 users) | Build complexity | Return driver | Hobby-cron impact |
|---|---|---|---|---|
| **In-app unread badge** (table + header count) | $0 | Low — one table, one GET route, one badge component | Weak — requires the user to *open* the app | None |
| **Daily email digest** (Resend) | **$0** (Resend free: 100/day, 3,000/mo) | Medium — template + one send pass + unsubscribe | **Strong — pushes the user back** | None *if* sent from the existing extract-signals cron tail (no new slot) |
| **Web push** (VAPID + service worker) | $0 | High — SW registration, VAPID keys, per-browser permission, poor/flaky iOS Safari | Strong when permitted, but opt-in friction is high | None |

Alternative email vendors: Supabase's built-in SMTP (templated auth-domain mail only —
not suited to product digests) vs **Resend** (free tier, one API call, good DX).
→ **Open question Q3.**

### 4.2 Recommendation

**v1 delivery channel = daily email digest via Resend**, sent from the **tail of the
existing `/api/admin/extract-signals` cron** (no new cron slot needed on Hobby).

Reasoning:
1. **It is the only channel that actually pulls the user back.** The product goal is
   retention; a badge that requires opening the app does not create a return visit.
2. **Zero marginal cost** at beta scale (Resend free tier covers 100/day ≫ the beta
   roster; one digest per user per day).
3. **No Hobby cron penalty** — Vercel Hobby caps crons at 2 jobs/day and both are
   taken; riding the existing extract-signals invocation avoids an upgrade.
4. Web push's opt-in friction (esp. iOS) and SW/VAPID surface area are disproportionate
   for a 10-user beta.

**Ship the in-app unread badge as well, but as a free byproduct** — it is just a count
over `alert_events` (already needed for the digest), rendered in the header. It is not
a "channel" requiring extra infra; it is the app-side surface of the same ledger.
`notification_prefs.watchlist_email` lets a user keep the badge and mute email.

Deferred to v1.1+: web push, per-signal-type email frequency, instant ("breaking")
emails.

---

## 5. UI

### 5.1 Watch / unwatch — `CompanyDrawer`

`src/components/CompanyDrawer.tsx` renders the entity header (canonical name + ticker).
Add a **★ Watch / ★ Watching** toggle button in the drawer header (next to the close
button), only when `companyData?.id` is present:

- Authenticated + not watching → outline star, label "Watch".
- Authenticated + watching → filled star, label "Watching".
- Unauthenticated → star disabled with a "Sign in to watch" tooltip.

Click hits `POST /api/v1/watchlist` (body `{ entity_id }`) to watch and
`DELETE /api/v1/watchlist?entity_id=…` to unwatch, optimistically updating the star
and reverting on error. The current watch state is fetched once per drawer open
(`GET /api/v1/watchlist` returns the user's watched `entity_id`s).

### 5.2 Filter — `SignalPanel`

`src/components/SignalPanel.tsx` already has a `sourceFilter` state
(`all | analysis | news`). Add a peer filter chip **"Watchlist"**. When active, filter
the rendered `signals` to those whose `companies` array intersects the user's watched
entity aliases/names (the `/api/v1/signals` response already includes a `companies`
string array per signal). Persist the selected filter in component state (a URL param
is a nice-to-have, not v1).

### 5.3 Unread badge — `Header`

Add a small numeric badge on the account/alert affordance in `src/components/Header.tsx`
driven by `GET /api/v1/alerts?unread=1` (returns `{ unread: n }`). Clicking opens a
lightweight alerts list (reuse the SignalPanel row styling) and marks rows read
(`PATCH /api/v1/alerts` with `{ ids: [...] }` or `PATCH /api/v1/alerts/[id]`).

### 5.4 Following management + empty states

- **New section on `/profile`** ("Following", between Segments and Notifications):
  a list of watched entities with an ✕ unwatch, plus the digest toggle + threshold
  slider. Empty state: *"You're not watching any companies yet. Open any company from
  the feed and tap ★ Watch."*
- **SignalPanel "Watchlist" filter empty state:** *"No signals for the companies you
  watch yet. Watch more companies to widen the net."*
- **Unread badge:** hidden (or "0") when no unread rows — never render a lone "0" pill.

### 5.5 Notification preferences (replace the disabled stub)

`/profile` currently shows a disabled "Notifications — Coming soon" section. Replace
the **Daily Digest** stub's `disabled` inputs with real controls wired to
`notification_prefs.digest` / `watchlist_email` and `watchlist_min_score`, persisted
through the existing `PATCH /api/user/preferences` (which already accepts
`notification_prefs`; add `watchlist_min_score` to its allow-list).

---

## 6. Card breakdown (proposed implementation cards)

Each card ≤ 3 file edits. Dependencies via kanban `parents`. Tests are owned by `qa`.

| # | Title | Assignee | Depends on | File edits (≤3) |
|---|---|---|---|---|
| **W1** | Migration 018 + types | coder | — | `supabase/migrations/018_watchlists_and_alerts.sql`, `src/lib/database.types.ts` |
| **W2** | Watchlist API + client helper | coder | W1 | `src/app/api/v1/watchlist/route.ts`, `src/lib/watchlist.ts` |
| **W3** | Alert fan-out lib + cron hook | coder | W1 | `src/lib/alerts.ts`, `src/app/api/admin/extract-signals/route.ts` |
| **W4** | Alerts read API (unread + mark read) | coder | W1 | `src/app/api/v1/alerts/route.ts`, `src/app/api/v1/alerts/[id]/route.ts` |
| **W5** | CompanyDrawer ★ watch toggle | coder | W2 | `src/components/CompanyDrawer.tsx`, `src/lib/watchlist.ts` (reuse client fns) |
| **W6** | SignalPanel "Watchlist" filter + Header unread badge | coder | W2, W4 | `src/components/SignalPanel.tsx`, `src/components/Header.tsx` |
| **W7** | Profile "Following" section + notification prefs wiring | coder | W2, W3 | `src/app/profile/page.tsx`, `src/app/api/user/preferences/route.ts` |
| **W8** | Email digest (Resend) + cron tail send | coder | W3, W4 | `src/lib/email.ts`, `src/lib/alerts.ts`, `src/app/api/admin/extract-signals/route.ts` |
| **Q1** | Tests: watchlist API + fan-out dedup | qa | W2, W3 | `src/lib/alerts.test.ts`, `src/app/api/v1/watchlist/route.test.ts` |
| **Q2** | Tests: alerts read API + threshold logic | qa | W4, W7 | `src/app/api/v1/alerts/route.test.ts`, `src/lib/alerts.test.ts` |
| **Q3** | Tests: UI star toggle + Watchlist filter (Vitest + RTL) | qa | W5, W6 | `src/components/CompanyDrawer.test.tsx`, `src/components/SignalPanel.test.tsx` |
| **Q4** | Tests: digest send pass (mock Resend) | qa | W8 | `src/lib/email.test.ts` |

Notes:
- W1 is the only migration; it must be applied out-of-band by Matt (spec is draft-only).
- W3 and W8 both touch `extract-signals/route.ts` **and** `src/lib/alerts.ts` — serialize
  them (W8 `parents: [W3]`) to avoid a merge hotspot. Flagged below.
- Vitest is configured (`vitest.config.ts`); existing suites live as colocated
  `*.test.ts` / `*.test.tsx` (e.g. `src/lib/importance.test.ts`,
  `src/components/CompanyDrawer.test.ts`).

**Hotspot:** `src/app/api/admin/extract-signals/route.ts` — touched by W3 and W8.
**Hotspot:** `src/lib/alerts.ts` — created by W3, extended by W8.

---

## 7. Open questions for Matt

- **Q1 — Score source of truth.** v1 triggers on `signals.investment_relevance_score`
  (≥0.65 default) and ignores `content.importance_score`. Is that the intended
  "importance_score", or do you want the rule-based `content.importance_score` (the
  HOT/HIGH/MEDIUM tiers in `src/lib/importance.ts`) to gate alerts instead? If both,
  do we alert on the max, or require both to clear their bar?
- **Q2 — Default threshold.** Default `watchlist_min_score = 0.65` means "every signal
  (the extraction floor already drops <0.65)". Want a higher default (e.g. 0.75) so the
  digest feels selective?
- **Q3 — Email vendor.** Confirm **Resend** (free tier) over Supabase SMTP / SendGrid.
  Any existing Resend account/domain, or should we add `RESEND_API_KEY` +
  `DIGEST_FROM` env vars?
- **Q4 — Digest cadence & timing.** Daily digest sent at the tail of the 08:15 UTC
  extract-signals run. OK? Or hold a daily summary for a fixed local morning time
  (would need a new cron slot → Hobby upgrade, or a Supabase `pg_cron`)?
- **Q5 — Auth requirement.** Watchlists require a logged-in user (RLS on `auth.uid()`).
  Is that acceptable for the beta roster, or do we want anonymous/local-device follows
  migrated on first login (as the phase-4 plan proposes for bookmarks)?
- **Q6 — Segments vs entities.** Confirm segments stay a separate onboarding hint and
  v1 does **not** auto-follow entities from segment membership. If not, do we want a
  "watch all top entities in my segments" one-click?
- **Q7 — Unsubscribe/compliance.** Product digests need a one-click unsubscribe and a
  physical-address footer (CAN-SPAM). Do we add an unsubscribe token route in v1, or
  restrict email to a hand-invited beta with a signed-off disclaimer?
- **Q8 — Breaking vs digest.** `notification_prefs.breaking` exists but is unused. Defer
  instant/"breaking" alerts to v1.1? (Digest-only in v1 was assumed here.)

---

## 8. Out of scope for v1

Web push; instant/breaking emails; segment-level alerts; watching non-company entity
types (`person`, `game`, `event`, `org`); watchlist import/export; per-signal-type
email filters; cross-user "trending among people you follow".
