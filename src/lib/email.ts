/**
 * Resend email transport + weekly watchlist digest template (spec
 * `docs/specs/watchlists-alerts.md` §3.4, §4; card W8).
 *
 * ---------------------------------------------------------------------------
 * ENVIRONMENT VARIABLES (none are required to build or run the app — every
 * code path here degrades to a logged no-op when config is missing):
 *
 *   RESEND_API_KEY        Resend API key (`re_...`). Required to actually send.
 *                         When unset (together with DIGEST_FROM) `sendEmail`
 *                         logs and returns `{ ok: false, skipped: true }`.
 *   DIGEST_FROM           `From:` header for the digest, e.g.
 *                         `AST Alerts <alerts@terminal.always-scheming.com>`.
 *                         The domain must be verified in Resend.
 *   DIGEST_FOOTER_ADDRESS Physical mailing address printed in the CAN-SPAM
 *                         footer line of every digest. Required by law; if
 *                         unset the footer omits the line (and logs a warning
 *                         at send time).
 *   DIGEST_UNSUB_SECRET   Optional HMAC-SHA256 secret used to derive a
 *                         deterministic 64-hex-char unsubscribe token from the
 *                         user id. When unset a random 32-byte token is used
 *                         instead. See {@link generateDigestUnsubToken}.
 *   NEXT_PUBLIC_SITE_URL  Public site origin used to build the unsubscribe
 *                         link (falls back to the production origin).
 * ---------------------------------------------------------------------------
 *
 * This module owns transport (`sendEmail`) and pure rendering
 * (`renderDigestHtml` / `renderDigestText`); the send *pass* — which users are
 * due, what goes in the digest, and the `alert_events` bookkeeping — lives in
 * `src/lib/alerts.ts` (`sendWeeklyDigests`).
 *
 * The one-click unsubscribe *route* (`/unsubscribe?token=...`) is owned by the
 * W9 card (`src/app/unsubscribe/route.ts` + `src/lib/unsubscribe.ts`); the
 * token shape produced here (64 lowercase hex chars) matches W9's validator.
 */

import { createHash, createHmac, randomBytes } from "crypto";

import { getEmailChip } from "./email-chip-map";

/** Resend's send endpoint. */
export const RESEND_API_URL = "https://api.resend.com/emails";

/** Fallback public origin when `NEXT_PUBLIC_SITE_URL` is unset. */
export const DEFAULT_SITE_URL = "https://terminal.always-scheming.com";

export interface EmailConfig {
  apiKey: string;
  from: string;
}

type Env = Record<string, string | undefined>;

function envLookup(env: Env, key: string): string | undefined {
  const raw = env[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resend credentials, or `null` when either half is missing. Treat a `null`
 * return as "email is not set up yet" — callers must not throw on it.
 */
export function getEmailConfig(env: Env = process.env): EmailConfig | null {
  const apiKey = envLookup(env, "RESEND_API_KEY");
  const from = envLookup(env, "DIGEST_FROM");
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/** `true` when Resend is configured enough to attempt a send. */
export function isEmailConfigured(env: Env = process.env): boolean {
  return getEmailConfig(env) !== null;
}

/** CAN-SPAM footer address, or `""` when unset. */
export function getDigestFooterAddress(env: Env = process.env): string {
  return envLookup(env, "DIGEST_FOOTER_ADDRESS") ?? "";
}

/** Public origin (no trailing slash) used for links inside the digest. */
export function getSiteUrl(env: Env = process.env): string {
  const raw = envLookup(env, "NEXT_PUBLIC_SITE_URL") ?? DEFAULT_SITE_URL;
  return raw.replace(/\/+$/, "");
}

/**
 * Derive the per-user one-click unsubscribe token.
 *
 * With `DIGEST_UNSUB_SECRET` set this is `HMAC-SHA256(secret, userId)` rendered
 * as hex — deterministic, so a retried digest run reuses the same stored token
 * instead of rotating it (an idempotency win), and still 64 lowercase hex chars
 * so W9's `isValidUnsubscribeTokenShape` accepts it. Without the secret it
 * falls back to 32 random bytes (256 bits) as hex.
 */
export function generateDigestUnsubToken(
  userId: string,
  env: Env = process.env,
): string {
  const secret = envLookup(env, "DIGEST_UNSUB_SECRET");
  if (secret) {
    return createHmac("sha256", secret).update(userId).digest("hex");
  }
  return randomBytes(32).toString("hex");
}

/** Absolute one-click unsubscribe URL for a token. */
export function buildDigestUnsubUrl(token: string, baseUrl?: string): string {
  const base = (baseUrl ?? getSiteUrl()).replace(/\/+$/, "");
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * RFC 8058 one-click unsubscribe headers. Mail clients that support it POST to
 * the https URL with body `List-Unsubscribe=One-Click` (handled by the W9
 * route's POST).
 */
export function buildDigestUnsubHeaders(
  token: string,
  baseUrl?: string,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${buildDigestUnsubUrl(token, baseUrl)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// ── transport ─────────────────────────────────────────────────────────────

/**
 * Redact an email address for logging: replace the local part with a
 * deterministic 8-hex-char SHA-256 prefix of the full address and keep the
 * domain, e.g. `3f2a9c1e@example.com`.
 *
 * Deterministic so the same recipient maps to the same token across log lines
 * (recipients stay distinguishable for debugging) while the raw address — PII
 * visible in Vercel logs — never gets written. Inputs without a usable domain
 * (no `@`, or a trailing `@`) fall back to the bare hash prefix.
 */
export function redactEmail(email: string): string {
  const value = typeof email === "string" ? email.trim() : "";
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 8);
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return hash;
  return `${hash}@${value.slice(at + 1).toLowerCase()}`;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Resend message id when the send succeeded. */
  id?: string;
  /** `true` when the send was skipped because Resend is not configured. */
  skipped?: boolean;
  error?: string;
  /** HTTP status Resend returned when it rejected the send. */
  status?: number;
  /** Resend's response body (truncated) for a rejected send. Never the API key. */
  detail?: string;
}

export interface SendEmailOptions {
  /** Inject config (tests); `null` forces the unconfigured path. */
  config?: EmailConfig | null;
  /** Inject a `fetch` implementation (tests). */
  fetchImpl?: typeof fetch;
}

/**
 * POST one message to Resend. Never throws: an unconfigured key, a network
 * error or a non-2xx response all come back as `{ ok: false, ... }` with a log
 * line, so the caller (the cron tail) keeps running.
 */
export async function sendEmail(
  input: SendEmailInput,
  opts: SendEmailOptions = {},
): Promise<SendEmailResult> {
  const config = opts.config !== undefined ? opts.config : getEmailConfig();
  if (!config) {
    console.warn(
      `[email] Resend not configured (RESEND_API_KEY/DIGEST_FROM unset) — skipping send to ${redactEmail(input.to)}`,
    );
    return { ok: false, skipped: true };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: input.headers,
        reply_to: input.replyTo,
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 1000);
      console.error(`[email] Resend rejected send to ${redactEmail(input.to)}: ${res.status} ${detail}`);
      return { ok: false, error: `resend_${res.status}`, status: res.status, detail };
    }

    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] Resend send to ${redactEmail(input.to)} threw:`, message);
    return { ok: false, error: message };
  }
}

// ── digest template ───────────────────────────────────────────────────────

/** One alert as it appears in the digest. */
export interface DigestAlert {
  entityName: string;
  signalType: string;
  summary: string;
  score: number;
  /** Link to the source article / signal. */
  url: string;
  createdAt: string | null;
  /**
   * Publication / source display name for the muted meta line (e.g.
   * `The Game Business`). Optional — an alert rendered without it simply
   * omits the source half of the meta line.
   */
  sourceName?: string | null;
  /**
   * Exchange ticker symbol when the entity is a listed company (e.g. `ACME`).
   * `null`/absent covers private companies and entities with no stored ticker.
   */
  ticker?: string | null;
  /**
   * `true` when the entity is publicly listed, `false` when known-private, and
   * `null`/absent when the listing status is unknown. Drives the digest's
   * PRIVATE tag / ticker tag.
   */
  isPublic?: boolean | null;
  /**
   * The source article's own title (the `content.title` row), when distinct
   * from {@link DigestAlert.summary}. Optional — the digest falls back to the
   * summary when it is absent.
   */
  title?: string | null;
  /**
   * The source's publication timestamp (the `content.published_at` row), used
   * for the digest date when present. Distinct from {@link DigestAlert.createdAt},
   * which is when the alert itself was recorded.
   */
  publishedAt?: string | null;
  /**
   * Whole-number relevance on a 0–100 scale, `round(score * 100)` — the
   * reader-facing "Relevance 93" figure. Computed by
   * {@link digestRelevance}; present on alerts produced by the digest pipeline.
   */
  relevance?: number;
}

/**
 * Reader-facing relevance: `score` (a 0–1 ranking value) as a 0–100 integer,
 * `round(score × 100)`. Non-finite input yields `0`; out-of-range values are
 * clamped to `[0, 100]` so a bad upstream score can never print "Relevance 140".
 */
export function digestRelevance(score: number): number {
  if (typeof score !== "number" || !Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score * 100)));
}

export interface DigestRenderInput {
  alerts: DigestAlert[];
  unsubscribeUrl: string;
  /** CAN-SPAM physical address line; omitted from the footer when empty. */
  footerAddress?: string;
  /** Public origin used for the "manage your watchlist" link. */
  siteUrl?: string;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function humanSignalType(t: string): string {
  return t.replace(/_/g, " ");
}

/** Schemes allowed in outbound article links. Everything else is dropped. */
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Return `url` only when it is an absolute `http:`/`https:` URL, else `null`.
 *
 * Article URLs come from upstream scrapers, so a `javascript:`, `data:` or
 * `vbscript:` value must never reach an `href`. Notes on the parsing order:
 *
 *  - Control characters are stripped and surrounding whitespace trimmed first.
 *    Browsers ignore embedded tabs/newlines when resolving a scheme, so
 *    `java\tscript:alert(1)` would otherwise bypass a naive check.
 *  - A scheme prefix is required: relative paths and protocol-relative
 *    (`//evil.example`) links are not outbound article links and are rejected.
 *  - `new URL` normalises the scheme to lowercase, so `HTTPS://` still passes.
 *
 * Callers render rejected URLs as plain text instead of a link (see
 * {@link renderDigestHtml} / {@link renderDigestText}).
 */
export function safeDigestUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const cleaned = url.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (cleaned.length === 0) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return null;
  try {
    const parsed = new URL(cleaned);
    return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol) ? cleaned : null;
  } catch {
    return null;
  }
}

/**
 * Absolute app deep link that opens the CompanyDrawer for an entity, e.g.
 * `https://site/?company=Acme%20Games`. Built from the trusted site origin
 * (see {@link getSiteUrl}) with the entity name URI-encoded as the `company`
 * query value — the same `?company=<canonical name>` param `LiveFeed`'s drawer
 * reads (see `parseCompanyDeepLink`). Returns `null` when the resulting URL is
 * not absolute https, so a misconfigured (non-https) origin can never emit an
 * insecure link; callers then render the entity name as plain text.
 */
export function buildDigestCompanyUrl(
  entityName: string,
  baseUrl?: string,
): string | null {
  const base = (baseUrl ?? getSiteUrl()).replace(/\/+$/, "");
  const url = `${base}/?company=${encodeURIComponent(entityName)}`;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Short "Nov 17" style label (UTC) for a digest timestamp, or `null` when the
 * value is missing/unparseable. UTC is fixed so the rendered date is stable
 * regardless of the server's timezone.
 */
export function formatDigestDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Muted per-item meta line: `"<source> · <date>"` (e.g. `The Game Business ·
 * Nov 17`). Returns the half that is present when only one is known, or `null`
 * when neither is — in which case the digest omits the line entirely.
 */
export function digestMetaLine(alert: DigestAlert): string | null {
  const source = alert.sourceName?.trim();
  const date = formatDigestDate(alert.createdAt);
  if (source && date) return `${source} · ${date}`;
  return source || date || null;
}

/**
 * Group alerts by entity name, entities sorted alphabetically and alerts
 * newest-first inside each group. Pure — this is the "grouped by entity" shape
 * the digest renders.
 */
export function groupDigestAlerts(alerts: DigestAlert[]): [string, DigestAlert[]][] {
  const byEntity = new Map<string, DigestAlert[]>();
  for (const a of alerts) {
    if (!a || !a.entityName) continue;
    const list = byEntity.get(a.entityName);
    if (list) list.push(a);
    else byEntity.set(a.entityName, [a]);
  }
  return Array.from(byEntity.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, list]) => [
      name,
      [...list].sort((a, b) => {
        const at = a.createdAt ?? "";
        const bt = b.createdAt ?? "";
        if (at === bt) return 0;
        return at < bt ? 1 : -1; // newest first
      }),
    ]);
}

/** Subject line, e.g. `Your weekly watchlist digest — 3 updates`. */
export function renderDigestSubject(alertCount: number): string {
  const n = alertCount === 1 ? "1 update" : `${alertCount} updates`;
  return `Your weekly watchlist digest — ${n}`;
}

/** Plain-text alternative part (deliverability + text-only clients). */
export function renderDigestText(input: DigestRenderInput): string {
  const site = (input.siteUrl ?? getSiteUrl()).replace(/\/+$/, "");
  const sorted = sortDigestAlerts(input.alerts);
  const companyNames = Array.from(new Set(sorted.map((a) => a.entityName))).sort(
    (a, b) => a.localeCompare(b),
  );
  const ctaUrl = buildDigestCtaUrl(site);
  const ctaLine = `${digestCtaLabel(sorted.length, companyNames)}${ctaUrl ? ` → ${ctaUrl}` : ""}`;
  const out: string[] = [ctaLine, ""];
  for (const [entity, list] of groupDigestAlerts(input.alerts)) {
    out.push(`${entity}`);
    out.push("=".repeat(entity.length));
    // App deep link for the entity (opens the drawer via `?company=`), then the
    // per-item article link + muted source/date meta line. Only absolute https
    // links are emitted; anything disallowed is omitted while the rest of the
    // digest still goes out.
    const companyUrl = buildDigestCompanyUrl(entity, site);
    if (companyUrl) out.push(companyUrl);
    for (const a of list) {
      out.push(
        `- [${humanSignalType(a.signalType)}] ${a.summary} (score ${a.score.toFixed(2)})`,
      );
      const link = safeDigestUrl(a.url);
      if (link) out.push(`  ${link}`);
      const meta = digestMetaLine(a);
      if (meta) out.push(`  ${meta}`);
    }
    out.push("");
  }
  out.push("—");
  out.push("You get this because you watch companies on your watchlist.");
  out.push(`Manage your watchlist: ${site}/profile`);
  out.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  if (input.footerAddress) out.push(input.footerAddress);
  return out.join("\n");
}

// ── digest layout (revision 2) ─────────────────────────────────────────────
//
// Two layouts selected by story count (spec "Revision 2"): Variant A (grouped
// list) for a week with `<= DIGEST_VARIANT_A_MAX` stories, Variant B (flat,
// relevance-ranked list) above it. Both share the header, hero, single top CTA
// and footer. All colours are precomputed hex (dark inline default) with
// `prefers-color-scheme: light` overrides in the <style> block; the chip palette
// comes from `email-chip-map.ts` (card 1). No JS, remote images, web fonts or
// external CSS.

/** Email-safe font stacks — no web fonts. */
const SANS_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_STACK =
  "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

/** Headline character clamp (spec R2.5) — word boundary + `…`. */
export const DIGEST_HEADLINE_MAX = 85;
/** Max stories per company in Variant A before the `+N more` link. */
export const DIGEST_PER_COMPANY_MAX = 3;
/** Max stories rendered in one digest before the `See all N` link. */
export const DIGEST_TOTAL_MAX = 15;
/** Story-count threshold: `<=` renders Variant A, above renders Variant B. */
export const DIGEST_VARIANT_A_MAX = 8;

/**
 * Allowlisted deep-link params for the digest CTA. The app's LiveFeed parses
 * only these values (unknown values are ignored), so the email can land the
 * reader in the Signals pane with the Watchlist chip pre-selected without
 * trusting arbitrary query data.
 */
export const DIGEST_CTA_VIEW = "signals";
export const DIGEST_CTA_FILTER = "watchlist";

/**
 * Clamp a headline to `max` characters on a word boundary, appending `…`.
 *
 * Gmail strips `-webkit-line-clamp`, so this must be a real character cut. Two
 * safety rules matter more than the word boundary:
 *  - never split a surrogate pair (an emoji or astral-plane glyph would render
 *    as two replacement characters);
 *  - never cut inside a literal `&...;` entity in the raw text, which would
 *    leave a dangling `&` (or an escaped fragment) visible.
 */
export function clampHeadline(text: string, max = DIGEST_HEADLINE_MAX): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  let end = max - 1;
  // Back off one code unit when the cut would land between a high/low surrogate.
  const last = end > 0 ? t.charCodeAt(end - 1) : 0;
  if (end > 0 && last >= 0xd800 && last <= 0xdbff) end -= 1;
  // Back off to the start of a literal entity whose `;` falls past the cut.
  const amp = t.lastIndexOf("&", end - 1);
  if (amp >= 0 && t.indexOf(";", amp) >= end) end = amp;
  let cut = t.slice(0, end);
  const sp = cut.lastIndexOf(" ");
  if (sp > 0) cut = cut.slice(0, sp);
  return `${cut.replace(/[\s,;:.!?\-–—]+$/, "")}…`;
}

/**
 * Value-led primary CTA label computed from the digest data. The HTML appends
 * ` &rarr;`; the text part appends ` →`.
 *
 * - exactly one company → name it: `See what's new at {Company}`
 * - otherwise → `Catch up on N updates` (singular for N = 1)
 */
export function digestCtaLabel(total: number, companyNames: string[]): string {
  const n = Math.max(0, Math.trunc(total));
  if (companyNames.length === 1) return `See what's new at ${companyNames[0]}`;
  if (n === 0) return "Catch up on your watchlist";
  return n === 1 ? "Catch up on 1 update" : `Catch up on ${n} updates`;
}

/**
 * Content-specific CTA destination. Only absolute **https** origins are
 * emitted; the query params are the fixed allowlisted pair the app understands.
 * Returns `null` for a non-https origin so callers can fall back to `/`.
 */
export function buildDigestCtaUrl(baseUrl?: string): string | null {
  const base = (baseUrl ?? getSiteUrl()).replace(/\/+$/, "");
  const url = `${base}/?view=${DIGEST_CTA_VIEW}&filter=${DIGEST_CTA_FILTER}`;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Reader-facing relevance: the explicit 0-100 value, else derived from score. */
function alertRelevance(a: DigestAlert): number {
  return typeof a.relevance === "number" && Number.isFinite(a.relevance)
    ? Math.min(100, Math.max(0, Math.round(a.relevance)))
    : digestRelevance(a.score);
}

/** Timestamp used for ordering + the meta line: publishedAt, else createdAt. */
function alertDate(a: DigestAlert): string {
  return (a.publishedAt ?? a.createdAt ?? "") as string;
}

/**
 * Flat relevance-first ordering (spec R2.6): relevance desc, then newest, then
 * company name asc. Invalid alerts (no entity name) are dropped.
 */
export function sortDigestAlerts(alerts: DigestAlert[]): DigestAlert[] {
  return alerts
    .filter((a) => a && a.entityName)
    .slice()
    .sort((a, b) => {
      const ra = alertRelevance(a);
      const rb = alertRelevance(b);
      if (ra !== rb) return rb - ra;
      const da = alertDate(a);
      const db = alertDate(b);
      if (da !== db) return da < db ? 1 : -1;
      return a.entityName.localeCompare(b.entityName);
    });
}

/**
 * Group alerts by entity, preserving the relevance-first order of the flat
 * list: the entity whose top story ranks highest comes first, and stories
 * inside an entity stay relevance-ordered (spec R2.6).
 */
export function groupSortedDigestAlerts(
  alerts: DigestAlert[],
): [string, DigestAlert[]][] {
  const map = new Map<string, DigestAlert[]>();
  for (const a of sortDigestAlerts(alerts)) {
    const list = map.get(a.entityName);
    if (list) list.push(a);
    else map.set(a.entityName, [a]);
  }
  return Array.from(map.entries());
}

/** Muted meta line for the new layout: `"<source> · <date>"` (publishedAt). */
export function digestItemMetaLine(alert: DigestAlert): string | null {
  const source = alert.sourceName?.trim();
  const date = formatDigestDate(alert.publishedAt ?? alert.createdAt);
  if (source && date) return `${source} · ${date}`;
  return source || date || null;
}

/** Monday (UTC) of the week containing the newest story, or `null`. */
function digestWeekStart(alerts: DigestAlert[]): Date | null {
  let newest = "";
  for (const a of alerts) {
    const d = alertDate(a);
    if (d && d > newest) newest = d;
  }
  if (!newest) return null;
  const dt = new Date(newest);
  if (Number.isNaN(dt.getTime())) return null;
  const daysSinceMonday = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - daysSinceMonday);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

/** `"3 updates across 3 companies this week"` (singular-aware). */
export function digestHeroTitle(updateCount: number, companyCount: number): string {
  const u = `${updateCount} update${updateCount === 1 ? "" : "s"}`;
  const c = `${companyCount} compan${companyCount === 1 ? "y" : "ies"}`;
  return `${u} across ${c} this week`;
}

/**
 * Article URL for an `<a href>` in the HTML part: only absolute **https** links
 * are emitted. `safeDigestUrl` (shared with the text part) still permits `http:`
 * but the email never ships an insecure `href`, so `http:` article URLs fall
 * back to plain text exactly like a `javascript:` one.
 */
function safeDigestHtmlUrl(url: unknown): string | null {
  const safe = safeDigestUrl(url);
  if (!safe) return null;
  try {
    return new URL(safe).protocol === "https:" ? safe : null;
  } catch {
    return null;
  }
}

/** Inline dark + class-based light chip for one signal type. */
function chipHtml(signalType: string): string {
  const chip = getEmailChip(signalType);
  if (!chip.label) return "";
  return (
    `<span class="chip-${chip.family} chip-txt" style="display:inline-block;` +
    `vertical-align:1px;padding:1px 5px;border-radius:3px;` +
    `background:${chip.dark.fill};color:${chip.dark.text};font-family:${MONO_STACK};` +
    `font-size:11px;font-weight:700;letter-spacing:.04em;line-height:16px;">` +
    `${escapeHtml(chip.label)}</span>`
  );
}

/** PRIVATE / ticker / PUBLIC tag for a company header row, or `""`. */
function companyTagHtml(alert: DigestAlert): string {
  const ticker = alert.ticker?.trim();
  let text: string | null = null;
  if (alert.isPublic === false) text = "PRIVATE";
  else if (ticker) text = ticker.toUpperCase();
  else if (alert.isPublic === true) text = "PUBLIC";
  if (!text) return "";
  return (
    `<span class="c-tag" style="display:inline-block;border:1px solid #444444;` +
    `border-radius:3px;padding:1px 6px;font-family:${MONO_STACK};font-size:10px;` +
    `letter-spacing:.06em;color:#9ca3af;white-space:nowrap;">${escapeHtml(text)}</span>`
  );
}

/** Headline link (article URL) or quiet plain-text fallback when unusable. */
function headlineHtml(alert: DigestAlert): string {
  const text = escapeHtml(clampHeadline(alert.summary));
  const safeUrl = safeDigestHtmlUrl(alert.url);
  if (safeUrl) {
    return (
      `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" ` +
      `class="c-txt" style="color:#d4d4d4;text-decoration:none;-webkit-text-decoration:none;font-weight:600;font-size:15px;line-height:21px;">` +
      `${text}<span class="c-acc" style="color:#77c4d9;white-space:nowrap;">&nbsp;&#8599;</span></a>`
    );
  }
  // Quiet fallback: render the headline as plain text — no "(link unavailable)".
  return `<span class="c-txt" style="color:#d4d4d4;font-weight:600;font-size:15px;line-height:21px;">${text}</span>`;
}

/**
 * Muted meta row: text left-aligned, signal-type chip right-aligned on the
 * same line (2-cell table so the chip sits at the bottom-right of the story
 * row without wrapping under the meta text). The chip is omitted when the
 * signal type has no label.
 */
function metaRowHtml(alert: DigestAlert, leftHtml: string | null): string {
  const chip = chipHtml(alert.signalType);
  if (!leftHtml && !chip) return "";
  const left = leftHtml
    ? `<td class="c-mut" style="font-size:11px;line-height:15px;color:#9ca3af;vertical-align:middle;">${leftHtml}</td>`
    : `<td></td>`;
  const chipCell = chip
    ? `<td align="right" style="padding-left:8px;white-space:nowrap;vertical-align:middle;">${chip}</td>`
    : "";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:7px;">` +
    `<tr>${left}${chipCell}</tr></table>`
  );
}

/** Hidden preheader: lead story + the next (up to two) company names. */
export function renderDigestPreheader(alerts: DigestAlert[]): string {
  const sorted = sortDigestAlerts(alerts);
  if (sorted.length === 0) return "Your weekly watchlist digest.";
  const lead = clampHeadline(sorted[0].summary, 140);
  const others: string[] = [];
  for (const a of sorted.slice(1)) {
    if (!others.includes(a.entityName) && others.length < 2) others.push(a.entityName);
  }
  const also = others.length ? ` Also: ${others.join(", ")}.` : "";
  return `${lead}${also}`;
}

/** `<style>` block: mso resets, mobile tweaks and the light-mode overrides. */
const DIGEST_STYLE = `<style>
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
/* Neutralise client auto-detected links (Apple Mail date/address/phone
   detectors) so the postal address + meta dates stay primary/muted instead of
   blue-underlined. Gmail's iOS/Android app injects its own auto-link styling
   that no CSS can override; see the .c-addr span markup for the best-effort
   containment there. */
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important;}
.u{text-decoration:underline !important;-webkit-text-decoration:underline !important;}
.c-addr{color:#4a4a55 !important;}
.gmail-hide{color:inherit !important;text-decoration:none !important;}
@media only screen and (max-width:480px){
.h1{font-size:20px !important;line-height:26px !important;}
.px{padding-left:16px !important;padding-right:16px !important;}
.btn{display:block !important;width:100% !important;}
.btn a{display:block !important;text-align:center !important;}
.hide-m{display:none !important;}
}
@media (prefers-color-scheme: light){
.c-page{background:#f4f5f7 !important;}
.c-card{background:#ffffff !important;}
.c-txt{color:#1a1a1a !important;}
.c-mut{color:#5b6270 !important;}
.c-acc{color:#0e7490 !important;}
.c-brand{color:#047857 !important;}
.c-brd{border-color:#e2e4e7 !important;}
.c-brdtop{border-top-color:#e2e4e7 !important;}
.c-brd-bot{border-bottom-color:#e2e4e7 !important;}
.c-tag{border-color:#c5cad1 !important;color:#5b6270 !important;}
.c-addr{color:#9a9aa5 !important;}
.c-head{border-bottom-color:#047857 !important;}
.c-cta{background:#0e7490 !important;}
.c-cta-txt{color:#ffffff !important;}
.chip-mint{background:#cde4dd !important;}
.chip-gold{background:#f0ddce !important;}
.chip-pink{background:#ecd2ef !important;}
.chip-muted{background:#e1e3e6 !important;}
.chip-txt{color:#1a1a1a !important;}
}
</style>`;

/** HTML part of the digest. Inline styles only (email clients strip <style>). */
export function renderDigestHtml(input: DigestRenderInput): string {
  const site = (input.siteUrl ?? getSiteUrl()).replace(/\/+$/, "");
  const sorted = sortDigestAlerts(input.alerts);
  const groups = groupSortedDigestAlerts(input.alerts);
  const total = sorted.length;
  const companyNames = Array.from(new Set(sorted.map((a) => a.entityName))).sort(
    (a, b) => a.localeCompare(b),
  );

  const weekStart = digestWeekStart(sorted);
  const weekLabel = weekStart ? formatDigestDate(weekStart.toISOString()) : null;
  const useFlat = total > DIGEST_VARIANT_A_MAX;

  const ctaUrl = buildDigestCtaUrl(site);
  const ctaHref = escapeHtml(ctaUrl ?? `${site}/`);
  const ctaLabel = digestCtaLabel(total, companyNames);
  const heroSub = weekLabel
    ? `Week of ${escapeHtml(weekLabel)} &middot; most relevant first`
    : "Most relevant first";
  // Sample digests are generated by the admin test endpoint; their story URLs
  // carry `?sample=digest-N`. Flag them in the hero so nobody mistakes the
  // rendered preview for real news (the subject line also carries `[TEST]`).
  const isSample = sorted.some((a) => /[?&]sample=digest-/.test(a.url ?? ""));
  const sampleNote = isSample
    ? `<p class="c-mut" style="margin:6px 0 0;font-family:${MONO_STACK};font-size:10px;letter-spacing:.08em;color:#9ca3af;">SAMPLE DATA &mdash; NOT REAL NEWS</p>`
    : "";

  // ── header + hero + CTA ──────────────────────────────────────────────────
  // Full product name as the wordmark (no "AST" abbreviation), kept on one
  // line at 375px by tightening the mono type: 12px/600px wordmark + 10px tag.
  const header =
    `<tr><td class="px c-page c-head" bgcolor="#0a0a0f" style="padding:14px 24px;background:#0a0a0f;border-bottom:2px solid #6decb9;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="font-family:${MONO_STACK};font-size:12px;letter-spacing:.02em;color:#d4d4d4;white-space:nowrap;">` +
    `<span class="c-brand" style="color:#6decb9;font-weight:700;">Always Scheming Terminal</span></td>` +
    `<td align="right" class="c-mut" style="white-space:nowrap;font-family:${MONO_STACK};font-size:10px;letter-spacing:.06em;color:#9ca3af;padding-left:8px;">WEEKLY DIGEST</td>` +
    `</tr></table></td></tr>`;

  const hero =
    `<tr><td class="px c-page" bgcolor="#0a0a0f" style="padding:18px 24px 0;background:#0a0a0f;">` +
    `<p class="h1 c-txt" style="margin:0;font-size:22px;line-height:28px;font-weight:700;color:#d4d4d4;">${escapeHtml(digestHeroTitle(total, companyNames.length))}</p>` +
    `<p class="c-mut" style="margin:4px 0 0;font-size:14px;line-height:20px;color:#9ca3af;">${heroSub}</p>` +
    `${sampleNote}</td></tr>`;

  const cta =
    `<tr><td class="px c-page" bgcolor="#0a0a0f" style="padding:14px 24px 0;background:#0a0a0f;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn"><tr>` +
    `<td class="c-cta" bgcolor="#77c4d9" style="background:#77c4d9;border-radius:6px;">` +
    `<a href="${ctaHref}" class="c-cta-txt" style="display:inline-block;padding:11px 20px;font-size:15px;font-weight:700;line-height:18px;color:#0a0a0f;text-decoration:none;-webkit-text-decoration:none;">${escapeHtml(ctaLabel)} &rarr;</a>` +
    `</td></tr></table></td></tr>`;

  // ── the list: Variant A (grouped) or B (flat) ─────────────────────────────
  let listSection: string;
  if (useFlat) {
    const shown = sorted.slice(0, DIGEST_TOTAL_MAX);
    const rows = shown
      .map((a, i) => {
        const companyUrl = buildDigestCompanyUrl(a.entityName, site);
        const nameLink = companyUrl
          ? `<a href="${escapeHtml(companyUrl)}" class="c-acc" style="color:#77c4d9;font-weight:700;text-decoration:none;-webkit-text-decoration:none;">${escapeHtml(a.entityName)}</a>`
          : `<span class="c-txt" style="color:#d4d4d4;font-weight:700;">${escapeHtml(a.entityName)}</span>`;
        const rest = digestItemMetaLine(a);
        const tail = rest ? ` &middot; ${escapeHtml(rest)}` : "";
        const metaLeft = `${nameLink}${tail}`;
        const last = i === shown.length - 1;
        const border = last ? "" : "border-bottom:1px solid #2a2a2a;";
        return (
          `<tr><td class="${last ? "" : "c-brd-bot"}" style="padding:11px 0;${border}">` +
          `<p style="margin:0;font-size:15px;line-height:21px;">${headlineHtml(a)}</p>` +
          `${metaRowHtml(a, metaLeft)}` +
          `</td></tr>`
        );
      })
      .join("");
    listSection =
      `<tr><td class="px c-page" bgcolor="#0a0a0f" style="padding:4px 24px 0;background:#0a0a0f;">` +
      `<p class="c-mut" style="margin:8px 0 0;font-family:${MONO_STACK};font-size:11px;letter-spacing:.08em;color:#9ca3af;">MOST RELEVANT FIRST</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;">${rows}</table>` +
      `</td></tr>`;
  } else {
    let budget = DIGEST_TOTAL_MAX;
    const cards: string[] = [];
    for (const [entity, list] of groups) {
      if (budget <= 0) break;
      const perShown = list.slice(0, Math.min(DIGEST_PER_COMPANY_MAX, budget));
      if (perShown.length === 0) continue;
      budget -= perShown.length;

      const companyUrl = buildDigestCompanyUrl(entity, site);
      const nameLink = companyUrl
        ? `<a href="${escapeHtml(companyUrl)}" class="c-acc" style="color:#77c4d9;font-weight:700;text-decoration:none;-webkit-text-decoration:none;">${escapeHtml(entity)}</a>`
        : escapeHtml(entity);
      const tag = companyTagHtml(list[0]);

      const rows = perShown
        .map((a) => {
          const rest = digestItemMetaLine(a);
          const metaLeft = rest ? escapeHtml(rest) : null;
          return (
            `<tr><td class="c-brdtop" style="padding:9px 16px 10px;border-top:1px solid #2a2a2a;">` +
            `<p style="margin:0;font-size:15px;line-height:21px;">${headlineHtml(a)}</p>` +
            `${metaRowHtml(a, metaLeft)}</td></tr>`
          );
        })
        .join("");

      const overflowCount = Math.max(0, list.length - DIGEST_PER_COMPANY_MAX);
      const overflowRow =
        overflowCount > 0 && companyUrl
          ? `<tr><td class="c-brdtop" style="padding:9px 16px 10px;border-top:1px solid #2a2a2a;font-size:12px;line-height:16px;">` +
            `<a href="${escapeHtml(companyUrl)}" class="c-acc" style="color:#77c4d9;text-decoration:none;-webkit-text-decoration:none;">` +
            `+${overflowCount} more ${escapeHtml(entity)} update${overflowCount === 1 ? "" : "s"} in Terminal &rarr;</a></td></tr>`
          : "";

      cards.push(
        `<tr><td class="px c-page" bgcolor="#0a0a0f" style="padding:12px 24px 0;background:#0a0a0f;">` +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1e1e1e" class="c-card c-brd" style="background:#1e1e1e;border:1px solid #2a2a2a;border-radius:8px;">` +
          `<tr><td style="padding:12px 16px 6px;">` +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td style="font-size:16px;font-weight:700;line-height:22px;">${nameLink}</td>` +
          `<td align="right">${tag}</td>` +
          `</tr></table></td></tr>${rows}${overflowRow}</table></td></tr>`,
      );
    }
    listSection = cards.join("\n");
  }

  // ── "See all N" only when the overall cap was hit ─────────────────────────
  const seeAll =
    total > DIGEST_TOTAL_MAX
      ? `<tr><td class="px c-page" bgcolor="#0a0a0f" style="padding:14px 24px 0;background:#0a0a0f;font-size:13px;line-height:18px;">` +
        `<a href="${ctaHref}" class="c-acc" style="color:#77c4d9;text-decoration:none;-webkit-text-decoration:none;">See all ${total} updates &rarr;</a></td></tr>`
      : "";

  // ── footer ────────────────────────────────────────────────────────────────
  const reason = companyNames.length
    ? `You get this because these companies are on your watchlist: ${companyNames
        .map((n) => escapeHtml(n))
        .join(", ")}.`
    : "You get this because you watch companies on your watchlist.";
  // Deliberately quiet postal address: present, selectable and last, but low
  // contrast (dark ~#4a4a55 on #0a0a0f, light #9a9aa5 on #fff) so it reads as
  // fine print rather than a headline. Never hidden — CAN-SPAM needs a valid
  // physical address and hidden text is a deliverability signal. The address
  // text itself comes from DIGEST_FOOTER_ADDRESS (Vercel env var) so it can be
  // swapped for a PO box/mail-forwarding address without a code change.
  const footerAddress = input.footerAddress
    ? `<p class="c-addr gmail-hide" style="margin:14px 0 0;font-size:11px;line-height:15px;color:#4a4a55;text-decoration:none;-webkit-text-decoration:none;">` +
      `<span class="c-addr gmail-hide" x-apple-data-detectors="false" style="color:inherit;text-decoration:none;-webkit-text-decoration:none;font-size:11px;line-height:15px;">` +
      `${escapeHtml(input.footerAddress)}</span></p>`
    : "";
  const footer =
    `<tr><td class="px c-page" bgcolor="#0a0a0f" style="padding:24px 24px 28px;background:#0a0a0f;font-size:12px;line-height:18px;color:#9ca3af;">` +
    `<p class="c-mut" style="margin:0;color:#9ca3af;">${reason}</p>` +
    `<p class="c-mut" style="margin:8px 0 0;color:#9ca3af;">` +
    `<a href="${escapeHtml(site)}/profile" class="c-acc u" style="color:#77c4d9;text-decoration:underline;-webkit-text-decoration:underline;">Manage watchlist</a> &middot; ` +
    `<a href="${escapeHtml(input.unsubscribeUrl)}" class="c-acc u" style="color:#77c4d9;text-decoration:underline;-webkit-text-decoration:underline;">Unsubscribe</a></p>` +
    `${footerAddress}</td></tr>`;

  const preheader = renderDigestPreheader(input.alerts);

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><meta name="x-apple-disable-message-reformatting"><title>Your weekly watchlist digest</title>${DIGEST_STYLE}</head>
<body class="c-page" bgcolor="#0a0a0f" style="margin:0;padding:0;background:#0a0a0f;">
<div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;font-size:1px;line-height:1px;color:#0a0a0f;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0f" class="c-page" style="background:#0a0a0f;">
<tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="c-txt" style="width:100%;max-width:600px;font-family:${SANS_STACK};font-size:15px;line-height:1.5;color:#d4d4d4;">
${header}
${hero}
${cta}
${listSection}
${seeAll}
${footer}
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── admin "send test digest" helpers ───────────────────────────────────────
//
// Used by `POST /api/admin/digest-test` (src/app/api/admin/digest-test/route.ts).
// They live here rather than in the route file because a Next.js route module
// may only export its HTTP handlers + route config; any other named export
// breaks `next build` ("not a valid Route export field"). This module is the
// natural home since it already owns the digest template, unsubscribe link and
// footer address.

/** At most 5 test digests per admin per hour. */
export const DIGEST_TEST_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxRequests: 5 };
/** How far back to look for the admin's real unsent alerts. */
export const DIGEST_TEST_LOOKBACK_DAYS = 7;
/** Cap on the real alerts rendered into a single test digest. */
export const DIGEST_TEST_MAX_ALERTS = 20;
/** Default number of sample stories a test digest renders. */
export const DIGEST_TEST_DEFAULT_STORIES = 3;
/** Hard cap on the `stories` request param (clamp 1..40). */
export const DIGEST_TEST_MAX_STORIES = 40;

/**
 * Coerce an untrusted `stories` value (JSON body number, numeric string from a
 * query string, `null`, garbage …) into an integer in `[1, 40]`.
 *
 * Returns `defaultValue` (itself clamped) when the value is missing or not a
 * finite number, so a malformed request degrades to the default rather than
 * throwing or rendering 0/NaN stories.
 */
export function clampStoryCount(
  raw: unknown,
  defaultValue = DIGEST_TEST_DEFAULT_STORIES,
): number {
  const fallback = Math.min(
    DIGEST_TEST_MAX_STORIES,
    Math.max(1, Math.trunc(Number(defaultValue)) || 1),
  );
  if (raw === null || raw === undefined || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(DIGEST_TEST_MAX_STORIES, Math.max(1, Math.trunc(n)));
}

export type SetOrMissing = "set" | "missing";

/**
 * Env-var presence snapshot returned to the caller so a misconfiguration is
 * visible from the UI without ever echoing a secret value. `siteUrl` is the
 * resolved public origin (not a secret).
 */
export interface DigestTestConfig {
  apiKey: SetOrMissing;
  from: SetOrMissing;
  footerAddress: SetOrMissing;
  unsubSecret: SetOrMissing;
  siteUrl: string;
}

/** `"set"` when the env var holds a non-empty (trimmed) value, else `"missing"`. */
function envFlag(env: Env, key: string): SetOrMissing {
  const raw = env[key];
  return typeof raw === "string" && raw.trim().length > 0 ? "set" : "missing";
}

/**
 * Independent presence flags for every env var the digest reads. Deliberately
 * does **not** go through `getEmailConfig()`, which returns `null` when *either*
 * `RESEND_API_KEY` or `DIGEST_FROM` is missing — that would report both halves
 * as `"missing"` when only one is, hiding exactly the misconfiguration this
 * endpoint exists to surface.
 */
export function describeDigestTestConfig(env: Env = process.env): DigestTestConfig {
  return {
    apiKey: envFlag(env, "RESEND_API_KEY"),
    from: envFlag(env, "DIGEST_FROM"),
    footerAddress: envFlag(env, "DIGEST_FOOTER_ADDRESS"),
    unsubSecret: envFlag(env, "DIGEST_UNSUB_SECRET"),
    siteUrl: getSiteUrl(env),
  };
}

/** Mask an address for the response body: `m***@example.com`. */
export function maskEmail(email: string): string {
  const value = typeof email === "string" ? email.trim() : "";
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

/**
 * Three clearly-labelled fake alerts used when the calling admin has no unsent
 * `alert_events`, so the digest layout — entity grouping, score, the entity
 * deep link, the article (summary) link, the source/date meta line and the
 * unsubscribe footer — can be eyeballed without waiting for a real Monday pass.
 * `url`s point at the configured origin so the links are clickable in the test
 * email; the `sourceName`/`createdAt` values render a representative meta line
 * (e.g. `The Game Business · Nov 17`).
 */
export function buildSampleDigestAlerts(
  siteUrl: string,
  count: number = DIGEST_TEST_DEFAULT_STORIES,
): DigestAlert[] {
  const base = siteUrl.replace(/\/+$/, "");
  // The first three samples drive the default 3-story digest. Headlines are
  // realistic and varied in length (no "SAMPLE —" prefix; the subject `[TEST]`
  // and the hero "SAMPLE DATA" note mark the set as fake). Larger requests
  // append deterministic, varied stories (see `sampleStory`).
  const legacy: DigestAlert[] = [
    {
      entityName: "Acme Games",
      signalType: "acquisition",
      summary:
        "Acme Games acquires Pixel Forge for $120M in a cash deal that folds an indie studio into its publishing arm.",
      title: "Acme Games acquires Pixel Forge for $120M",
      score: 0.93,
      relevance: 93,
      url: `${base}/?sample=digest-1`,
      createdAt: "2026-11-17T09:00:00.000Z",
      publishedAt: "2026-11-17T08:30:00.000Z",
      sourceName: "The Game Business",
      ticker: "ACME",
      isPublic: true,
    },
    {
      entityName: "Northstar Interactive",
      signalType: "fundraising",
      summary:
        "Northstar Interactive raises a $45M Series B led by Horizon Ventures to expand its live-service slate.",
      title: "Northstar Interactive raises $45M Series B",
      score: 0.88,
      relevance: 88,
      url: `${base}/?sample=digest-2`,
      createdAt: "2026-11-16T09:00:00.000Z",
      publishedAt: "2026-11-16T08:15:00.000Z",
      sourceName: "PocketGamer.biz",
      ticker: null,
      isPublic: false,
    },
    {
      entityName: "Cobalt Studios",
      signalType: "layoffs",
      summary:
        "Cobalt Studios cuts 80 roles as its live-service project winds down after a delayed launch.",
      title: "Cobalt Studios cuts 80 roles",
      score: 0.81,
      relevance: 81,
      url: `${base}/?sample=digest-3`,
      createdAt: "2026-11-15T09:00:00.000Z",
      publishedAt: "2026-11-15T07:45:00.000Z",
      sourceName: "GamesIndustry.biz",
      ticker: "CBLT",
      isPublic: true,
    },
  ];

  const n = clampStoryCount(count);
  if (n <= legacy.length) return legacy.slice(0, n);

  const extra: DigestAlert[] = [];
  for (let i = legacy.length; i < n; i++) extra.push(sampleStory(base, i));
  return [...legacy, ...extra];
}

// ── larger-set sample generation ───────────────────────────────────────────
//
// Everything below is pure and independent of the clock/env, so the same
// `stories` request always renders the same digest (QA and snapshots rely on
// this). The design exercises the template's real edge cases:
//   • ~40% of stories sit under three "shared" companies in chunks of up to 5,
//     so the 3-per-company cap and the `+N more` overflow row fire;
//   • a mix of public (ticker) and private companies;
//   • every signal type incl. the unknown/other fallbacks;
//   • long (>85 char, triggers the clamp) and very short headlines;
//   • headlines with `&`, `"quotes"`, `<angle brackets>`, emoji and non-latin
//     text — the escaping checks;
//   • varied sources and dates spread across the past 7 days.

/**
 * Fixed 10-slot company pattern for story index `i`. Slots 0/1/2 match the
 * legacy trio, and ~40% of slots are the shared companies — with "Acme Games"
 * recurring early enough that an 8-story (Variant A) digest exceeds the
 * 3-per-company cap and renders a `+N more` overflow row. Because the pattern
 * is index-based (not count-based), a story's company never changes as `n`
 * grows, so the same index always renders identically at every size.
 *
 * The remaining slots are one-off companies, including a name with `&`
 * ("Kite & Reel") and a non-latin name ("九龍互動") for escaping checks.
 */
const SAMPLE_COMPANY_PATTERN = [
  "Acme Games", // 0  (legacy)
  "Northstar Interactive", // 1  (legacy)
  "Cobalt Studios", // 2  (legacy)
  "Acme Games", // 3
  "Acme Games", // 4
  "Orbital Forge", // 5
  "Acme Games", // 6  -> Acme reaches 4 by i=6
  "Vega Interactive", // 7
  "Kite & Reel", // 8
  "Northstar Interactive", // 9
  "Helios Media", // 10
  "Cobalt Studios", // 11
  "Lumen Works", // 12
  "Pixel Forge", // 13
  "九龍互動", // 14
  "Nova Arcade", // 15
  "Northstar Interactive", // 16
  "Meridian Systems", // 17
  "Acme Games", // 18
  "Harbor Light Games", // 19
  "Aurora Labs", // 20
  "Sandpiper Studio", // 21
];

/** Every signal type the app knows, plus the unknown/other fallbacks. */
const SAMPLE_SIGNAL_TYPES = [
  "acquisition",
  "fundraising",
  "earnings",
  "layoffs",
  "leadership",
  "product_launch",
  "regulatory",
  "platform_change",
  "macro",
  "unknown",
  "other",
];

const SAMPLE_SOURCES = [
  "The Game Business",
  "PocketGamer.biz",
  "GamesIndustry.biz",
  "Business Wire",
  "Eurogamer",
  "Financial Times",
  "TechRadar",
  "九龍日報",
  "VentureBeat",
];

/** Ticker/isPublic metadata for a sample company (private when unlisted). */
function sampleCompanyMeta(name: string): { ticker: string | null; isPublic: boolean } {
  switch (name) {
    case "Acme Games":
      return { ticker: "ACME", isPublic: true };
    case "Cobalt Studios":
      return { ticker: "CBLT", isPublic: true };
    case "Helios Media":
      return { ticker: "HLIO", isPublic: true };
    case "Orbital Forge":
      return { ticker: "ORBF", isPublic: true };
    case "Nova Arcade":
      return { ticker: "NOVA", isPublic: true };
    case "Pixel Forge":
      return { ticker: "PXFG", isPublic: true };
    case "Meridian Systems":
      return { ticker: "MRDN", isPublic: true };
    case "Northstar Interactive":
    case "Vega Interactive":
    case "Lumen Works":
    case "Kite & Reel":
    case "Harbor Light Games":
    case "九龍互動":
    case "Aurora Labs":
    case "Sandpiper Studio":
      return { ticker: null, isPublic: false };
    default:
      return { ticker: null, isPublic: false };
  }
}

/**
 * Company for story `i` of `n`. Index-based via {@link SAMPLE_COMPANY_PATTERN},
 * so the same index always maps to the same company regardless of `n` (the
 * legacy trio occupies the first three slots; extras follow the pattern).
 */
function sampleCompanyForIndex(i: number): string {
  return SAMPLE_COMPANY_PATTERN[i % SAMPLE_COMPANY_PATTERN.length];
}

/** A deterministic, varied headline for extra story `i` (raw, unescaped). */
function sampleSummary(i: number, company: string): string {
  switch (i % 8) {
    case 0:
      return `${company} acquires a rival studio for $120M in a cash-and-stock deal.`;
    case 1:
      return `${company} raises a $45M Series B led by Horizon Ventures.`;
    case 2:
      return `${company} cuts 80 roles as its live-service project winds down.`;
    case 3:
      return `${company} names a new CFO.`; // very short
    case 4:
      // ~109 chars: exercises the word-boundary clamp + `…`.
      return `${company} unveils a sweeping multi-year restructuring plan spanning three studios and two publishing labels.`;
    case 5:
      // `"`, `&`, `<`, `>`: escaping checks.
      return `${company} calls the $1.2B deal "transformative" & <non-binding> as regulators circle.`;
    case 6:
      // emoji + non-latin: passthrough vs escaping checks.
      return `${company} launches 新作 🎮 with a surprise cross-play beta 🌐✨`;
    default:
      return `${company} reports Q3 bookings up 12% & raises full-year guidance.`;
  }
}

/** A fixed-week timestamp pair for extra story `i` (deterministic, UTC). */
function sampleTimestamp(i: number): { createdAt: string; publishedAt: string } {
  // Anchor at the newest sample day; step back 4h per story so ~40 stories span
  // the past week. Fixed literal → no clock/env dependence.
  const anchor = Date.UTC(2026, 10, 21, 9, 0, 0); // 2026-11-21T09:00Z
  const created = new Date(anchor - i * 4 * 60 * 60 * 1000);
  const published = new Date(created.getTime() - 30 * 60 * 1000);
  return { createdAt: created.toISOString(), publishedAt: published.toISOString() };
}

/** One deterministic, varied extra sample story (index `i`). */
function sampleStory(base: string, i: number): DigestAlert {
  const company = sampleCompanyForIndex(i);
  const meta = sampleCompanyMeta(company);
  const summary = sampleSummary(i, company);
  const score = Math.max(0.4, Math.round((0.95 - i * 0.015) * 100) / 100);
  const { createdAt, publishedAt } = sampleTimestamp(i);
  return {
    entityName: company,
    signalType: SAMPLE_SIGNAL_TYPES[i % SAMPLE_SIGNAL_TYPES.length],
    summary,
    title: summary,
    score,
    relevance: Math.round(score * 100),
    url: `${base}/?sample=digest-${i + 1}`,
    createdAt,
    publishedAt,
    sourceName: SAMPLE_SOURCES[i % SAMPLE_SOURCES.length],
    ticker: meta.ticker,
    isPublic: meta.isPublic,
  };
}
