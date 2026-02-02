# Phase 4: Account System — Architecture Plan

> Saved 2026-02-02. Discuss decisions before building.

## Key Decisions (pending)

1. **Public feed, accounts for extras** — ✅ Agreed. Feed is public, accounts unlock bookmarks/presets/read tracking.
2. **Auth method** — Email/password? Add Google/GitHub social login? (Supabase supports all)
3. **Beta invite count** — PRD says 5-10 industry contacts. Self-serve invite system or manual?
4. **Mobile-responsive** — ✅ Do before accounts. Users will check on phones.

---

## Layer 1: Auth Foundation (do first)

**What:** Supabase Auth with email/password. Users can sign up, log in, and we know who they are.

**Schema:**
```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  role text DEFAULT 'user',  -- 'admin' | 'user' | 'beta'
  created_at timestamptz DEFAULT now()
);
```

**Code changes:**
- Add `@supabase/ssr` package for cookie-based auth in Next.js App Router
- Create auth middleware (protects routes, injects user session)
- Login/signup pages (`/login`, `/signup`)
- Replace `createServerClient()` service-role calls with session-aware clients where needed
- Feed remains public — auth unlocks features

**Effort:** ~2-3 hours

---

## Layer 2: User Features

### 2a. Bookmarks / Reading List
```sql
CREATE TABLE bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);
```
- ⭐ toggle on each article, synced across devices
- `/bookmarks` page showing saved articles
- Migrate any localStorage bookmarks on first login

### 2b. Saved Filter Presets
```sql
CREATE TABLE filter_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### 2c. Read/Unread Tracking
```sql
CREATE TABLE read_items (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE CASCADE,
  read_at timestamptz DEFAULT now(),
  PRIMARY KEY(user_id, item_id)
);
```
- Dim articles you've already clicked
- "X unread" count, "Show unread only" toggle

**Effort:** ~3-4 hours for all three

---

## Layer 3: Access Control

```sql
CREATE TABLE invite_codes (
  code text PRIMARY KEY,
  created_by uuid REFERENCES auth.users(id),
  used_by uuid REFERENCES auth.users(id),
  used_at timestamptz,
  expires_at timestamptz
);
```
- Invite-only beta signup
- Role-based: `admin` (Matt), `beta` (invitees), `user` (future public)
- Paid tiers (later): Stripe, `profiles.tier` column

**Effort:** ~1-2 hours

---

## Layer 4: Analytics

- Track page views, filter usage, return visits
- Options: Plausible (free tier), PostHog (free tier), or custom Supabase events
- `/admin/analytics` dashboard
- Kill signal metric: users returning >3x/week unprompted

**Effort:** ~2-4 hours

---

## Recommended Build Order

| Step | What | Effort |
|------|------|--------|
| 0 | Mobile-responsive layout | ~2-3h |
| 1 | Auth foundation + login/signup | ~2-3h |
| 2 | Bookmarks | ~1-2h |
| 3 | Invite codes | ~1-2h |
| 4 | Read/unread tracking | ~1-2h |
| 5 | Saved filter presets | ~1h |
| 6 | Analytics | ~2-4h |
| 7 | Paid tiers | TBD |

*Total layers 0-3: ~one weekend session.*
