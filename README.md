# Always Scheming Terminal — Product Requirements Document

## Overview

The Always Scheming Terminal (AST) is a real-time gaming industry news aggregation and intelligence platform. It consolidates headlines, analysis, earnings reports, and fundraising announcements from curated industry sources into a single, filterable, terminal-style interface.

AST exists to validate the following hypothesis:

> "We believe aggregating qualitative data sources (Substacks, podcasts, interviews, etc.) together with broadly accepted quantitative data (earnings, publicly available KPIs, sales figures, etc.) will simplify and streamline the research process for Victor Venture and Annie Analyst, as measured by engagement with the aggregation platform (site visitors, link CTRs, accounts created, etc.)."

## What This Is

A decision-support intelligence layer for gaming industry professionals. Think Bloomberg Terminal meets gaming — opinionated curation, high signal density, low noise.

## What This Isn't

- A general news aggregator (gaming industry only)
- A social media dashboard (no Twitter/X in v1)
- A financial terminal (no stock data in v1)
- A content treadmill (automated ingestion, not manual publishing)

## Target Users

**V1:** Matt (internal dogfooding)
**V2:** Private beta (5-10 industry contacts)
**V3:** Public launch with free + paid tiers (TBD)

See the Clawd Constitution for full persona definitions (Victor Venture, Frank Founder, Annie Analyst).

---

## V1 Scope

### Core Experience

A single-panel, real-time news feed displaying content from curated gaming industry sources. Dark terminal aesthetic. Top bar filtering by source, company, platform, investing theme, and content category. Chronological sort. Auto-refresh.

### Content Sources (V1)

| Source | Type | URL |
|--------|------|-----|
| Naavik | Newsletter/Analysis | naavik.co |
| Deconstructor of Fun | Newsletter/Analysis | deconstructoroffun.com |
| GameDiscoverCo | Newsletter/Analysis | gamediscover.co |
| MobileGamer.biz | News | mobilegamer.biz |
| GamesIndustry.biz | News | gamesindustry.biz |
| Game File (Stephen Totilo) | Newsletter | gamefile.news |
| InvestGame | Investment/Analysis | investgame.net |
| Elite Game Developers (Joakim Achren) | Newsletter/Analysis | elitegamedevelopers.com |

**Excluded:** Kotaku, Polygon, and similar consumer/casual outlets.

**Content types ingested:** Headlines, long-form articles, earnings reports, fundraising/M&A announcements, podcast episode links.

**Paywalled sources:** Ingest whatever the RSS feed provides (title + excerpt). Full text only if freely available.

### Content Tagging

All ingested content is automatically tagged by AI. Tags are extracted, not matched against a fixed list (verify/curate later). Manual override available.

**Tag dimensions:**

| Dimension | Examples |
|-----------|----------|
| Company | EA, Epic Games, Tencent, Supercell, etc. |
| Platform | Console, PC, Mobile, VR, Web |
| Investing Theme | AI, UGC, Live Services, Cloud Gaming, VR/AR, Blockchain |
| Content Category | Article, Earnings, M&A, Fundraising, Podcast, Analysis |

### Feed Behavior

- **Sort:** Chronological (newest first)
- **Refresh:** Auto-refresh (new items appear without page reload)
- **Filtering:** Top bar with AND/OR logic across all tag dimensions
- **Data retention:** Everything — all ingested content is stored permanently
- **Read/unread:** Not tracked in v1
- **Search:** Text search across titles and content
- **Notifications:** None in v1

### Company List

50+ public and private gaming companies. To be drafted and maintained as a living document. Not a hard filter for v1 — AI extracts company mentions from content freely. The list serves as a reference for verification and future features (company profiles, financial data).

---

## Technical Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth (v2+) | Supabase Auth |
| AI/Tagging | OpenAI API (gpt-4o-mini for cost efficiency) |
| RSS Parsing | rss-parser |
| Hosting | Vercel |
| Repo | github.com/WALTAHHH/Always-Scheming-Terminal |

### Database Schema

```sql
-- RSS feed sources
create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  feed_url text not null,
  source_type text not null, -- 'newsletter', 'news', 'analysis', 'podcast'
  active boolean default true,
  last_fetched_at timestamptz,
  created_at timestamptz default now()
);

-- Ingested content items
create table items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id),
  external_id text, -- guid/link for deduplication
  title text not null,
  content text, -- excerpt or full text
  url text not null,
  author text,
  published_at timestamptz,
  ingested_at timestamptz default now(),
  tags jsonb default '{}', -- AI-generated tags
  unique(source_id, external_id)
);

-- Tag extractions (normalized for filtering)
create table item_tags (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade,
  dimension text not null, -- 'company', 'platform', 'theme', 'category'
  value text not null,
  confidence float, -- AI confidence score
  manual boolean default false, -- manually added/verified
  unique(item_id, dimension, value)
);

-- Company reference list (for future features)
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  ticker text, -- null for private companies
  is_public boolean default false,
  sector text, -- 'publisher', 'developer', 'platform', 'services', 'hardware'
  created_at timestamptz default now()
);

-- Indexes
create index idx_items_published on items(published_at desc);
create index idx_items_source on items(source_id);
create index idx_item_tags_dimension on item_tags(dimension, value);
create index idx_item_tags_item on item_tags(item_id);
```

### Ingestion Pipeline

1. **Scheduler:** Supabase Edge Function or Vercel Cron
   - Every 30 minutes during business hours (6am-8pm PT)
   - Every 60 minutes off-hours
2. **Fetch:** Pull RSS feeds for all active sources
3. **Deduplicate:** Check `external_id` (guid or URL) against existing items
4. **Store:** Insert new items into `items` table
5. **Tag:** Send title + excerpt to OpenAI for tag extraction
6. **Store tags:** Insert into `item_tags` table

### AI Tagging Prompt (Draft)

```
Extract tags from this gaming industry article.

Title: {title}
Content: {excerpt}

Return JSON with these dimensions:
- companies: company names mentioned (array of strings)
- platforms: gaming platforms relevant (console/PC/mobile/VR/web)
- themes: investing themes (AI/UGC/live-services/cloud-gaming/VR-AR/blockchain/esports/indie)
- category: content type (article/earnings/m-and-a/fundraising/podcast/analysis/opinion)

Return only what's clearly present. Omit dimensions with no matches.
```

### API Routes

```
GET  /api/items          — Paginated feed with tag filters
GET  /api/items/[id]     — Single item detail
GET  /api/sources        — List all sources
POST /api/ingest         — Trigger ingestion (cron endpoint, secured)
GET  /api/tags           — All unique tags by dimension (for filter UI)
```

### Frontend Pages

```
/                        — Main feed (single page app feel)
```

That's it for v1. One page. The feed IS the product.

---

## UI Specification

### Visual Reference

PhoenixNews (phoenixnews.io) — dark terminal aesthetic, high information density, clean typography.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ ⚡ Always Scheming Terminal        [filters]  [search]  │
├─────────────────────────────────────────────────────────┤
│ Filter: [Source ▾] [Company ▾] [Platform ▾] [Theme ▾]  │
│         [Category ▾]                      [AND/OR toggle]│
├─────────────────────────────────────────────────────────┤
│ 17:23  GamesIndustry.biz                                │
│  EA reports Q4 live services revenue up 15% YoY         │
│  [EA] [earnings] [console] [PC] [live-services]         │
│─────────────────────────────────────────────────────────│
│ 17:15  Naavik                                           │
│  The UGC Monetization Playbook: What Roblox Got Right   │
│  [Roblox] [UGC] [analysis] [PC] [mobile]               │
│─────────────────────────────────────────────────────────│
│ 16:58  InvestGame                                       │
│  Lightspeed leads $30M Series B in Seoul-based studio   │
│  [fundraising] [mobile] [indie]                         │
│─────────────────────────────────────────────────────────│
│                    ... auto-refreshing ...               │
└─────────────────────────────────────────────────────────┘
```

### Design Tokens

- **Background:** #0a0a0f (near-black)
- **Surface:** #12121a (card/row background)
- **Border:** #1e1e2e (subtle dividers)
- **Text primary:** #e0e0e0
- **Text secondary:** #888888 (timestamps, source names)
- **Accent:** #77c4d9 (AS brand cyan — links, active filters)
- **Tag chips:** Dark background (#1a1a2e) with colored left border per dimension
- **Font:** JetBrains Mono or similar monospace for terminal feel
- **Information density:** High — minimal padding, compact rows

### Interactions

- Click article → opens source URL in new tab (we're an aggregator, not a reader)
- Filter chips are toggleable — click to add/remove from active filters
- AND/OR toggle switches filter logic globally
- Auto-refresh: new items slide in at top with subtle animation
- Scroll position preserved during refresh (new items badge: "12 new items ↑")

---

## Build Phases

### Phase 1: Foundation ✅
- [x] Project setup (Next.js 15, TypeScript, Tailwind, Supabase)
- [x] Database schema (sources, items, item_tags, companies)
- [x] Seed sources table with v1 source list (9 sources)
- [x] RSS ingestion pipeline (fetch → dedupe → store)
- [x] Basic feed UI (chronological list, dark theme, source labels)
- [x] Deploy to Vercel

### Phase 2: Intelligence ✅
- [x] Hybrid tagging (rule-based categories/platforms/themes + AI company extraction)
- [x] Tag extraction on ingestion
- [x] Filter UI (top bar dropdowns per dimension)
- [x] AND/OR filter logic
- [x] Text search
- [x] Scheduled ingestion (Vercel Cron — daily at 8am UTC)
- [x] Story clustering (Jaccard similarity, 72h window, multi-source detection)
- [x] Rule-based importance scoring (category, source authority, company density, financial signals, tag richness, cluster bonuses)
- [x] Sort toggle (Signal / Latest)
- [x] Visual importance indicators (HOT / HIGH tiers using AS palette)

### Phase 3: Polish (current)
- [x] Auto-refresh with "new items" banner
- [x] Keyboard navigation (j/k, Enter, ?)
- [x] AS design palette applied consistently across all components
- [x] Draft company list (76 companies, 9 segments)
- [x] Source management page (add/remove/pause sources, sortable table)
- [x] Ingestion health monitoring (logs, error tracking, per-source history, manual fetch)
- [x] Performance optimization (infinite scroll pagination, cursor-based API)
- [ ] Increase ingestion frequency (every 30 min during business hours) — deferred
- [x] Hide articles from disabled sources in feed
- [x] Manual fetch per source (admin)
- [x] Sortable columns on health dashboard

**Done when:** Matt uses this daily instead of checking sources individually. Hypothesis validation begins.

### Phase 4: Users & Growth
- [ ] Supabase Auth (email/password)
- [ ] Private beta invites
- [ ] User preferences (saved filters, default view)
- [ ] Personalized importance scoring (per-user weights)
- [ ] Mobile-responsive layout
- [ ] Analytics (page views, filter usage, return visits)
- [ ] Free/paid tier structure (TBD)

**Done when:** 3+ external users engaging >3x/week.

---

## Kill Signal

If by week 8 of active use, nobody (including Matt) returns to the terminal unprompted and regularly, the hypothesis is dead. Pivot or kill.

---

## Open Tasks

- [x] Draft company list (76 companies, 9 segments — done 2/2)
- [ ] Determine OpenAI API budget for tagging — deferred
- [x] Source management UI
- [x] Ingestion health dashboard (with manual fetch per source)
- [ ] Increase cron frequency to 30-min intervals — deferred

---

## References

- **Visual comp:** PhoenixNews (phoenixnews.io)
- **Strategic context:** Clawd Constitution (Notion)
- **Hypothesis:** Constitution → Current working hypotheses → #1
- **Target personas:** Victor Venture, Frank Founder, Annie Analyst
- **Live URL:** https://always-scheming-terminal.vercel.app

*Last updated: 2026-02-02*
