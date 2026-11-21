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

/** Subject line, e.g. `Weekly AST watchlist digest — 3 updates`. */
export function renderDigestSubject(alertCount: number): string {
  const n = alertCount === 1 ? "1 update" : `${alertCount} updates`;
  return `Weekly AST watchlist digest — ${n}`;
}

/** Plain-text alternative part (deliverability + text-only clients). */
export function renderDigestText(input: DigestRenderInput): string {
  const site = (input.siteUrl ?? getSiteUrl()).replace(/\/+$/, "");
  const out: string[] = [];
  for (const [entity, alerts] of groupDigestAlerts(input.alerts)) {
    out.push(`${entity}`);
    out.push("=".repeat(entity.length));
    // App deep link for the entity (opens the drawer via `?company=`), then the
    // per-item article link + muted source/date meta line. Only absolute https
    // links are emitted; anything disallowed is omitted while the rest of the
    // digest still goes out.
    const companyUrl = buildDigestCompanyUrl(entity, site);
    if (companyUrl) out.push(companyUrl);
    for (const a of alerts) {
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
  out.push("You receive this because you watch companies on Always Scheming Terminal.");
  out.push(`Manage your watchlist: ${site}/profile`);
  out.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  if (input.footerAddress) out.push(input.footerAddress);
  return out.join("\n");
}

/** HTML part of the digest. Inline styles only (email clients strip <style>). */
export function renderDigestHtml(input: DigestRenderInput): string {
  const site = (input.siteUrl ?? getSiteUrl()).replace(/\/+$/, "");
  const groups = groupDigestAlerts(input.alerts);

  const sections = groups
    .map(([entity, alerts]) => {
      // Company heading links to the in-app CompanyDrawer (`?company=<name>`);
      // without a valid https deep link it degrades to plain text.
      const companyUrl = buildDigestCompanyUrl(entity, site);
      const heading = companyUrl
        ? `<a href="${escapeHtml(companyUrl)}" style="color:#e7e9ee;text-decoration:none;">${escapeHtml(entity)}</a>`
        : escapeHtml(entity);

      const rows = alerts
        .map((a) => {
          const type = escapeHtml(humanSignalType(a.signalType));
          const summary = escapeHtml(a.summary);
          // Reject non-http(s) schemes before they reach an href; a rejected
          // article degrades to plain text with an "invalid link" note. A valid
          // article link opens in a new tab.
          const safeUrl = safeDigestUrl(a.url);
          const title = safeUrl
            ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" style="color:#e7e9ee;text-decoration:none;font-size:15px;line-height:1.45;">${summary}</a>`
            : `<span style="color:#e7e9ee;font-size:15px;line-height:1.45;">${summary}</span>
      <span style="color:#6b7280;font-size:12px;"> (link unavailable)</span>`;
          const meta = digestMetaLine(a);
          const metaLine = meta
            ? `\n    <div style="color:#6b7280;font-size:12px;margin-top:4px;">${escapeHtml(meta)}</div>`
            : "";
          return `<tr>
  <td style="padding:10px 0;border-bottom:1px solid #232831;">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7cc4ff;margin-bottom:4px;">
      ${type} · score ${a.score.toFixed(2)}
    </div>
    ${title}${metaLine}
  </td>
</tr>`;
        })
        .join("\n");

      return `<tr>
  <td style="padding:20px 0 4px;font-size:16px;font-weight:700;color:#e7e9ee;">${heading}</td>
</tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`;
    })
    .join("\n");

  const footerAddress = input.footerAddress
    ? `<p style="margin:8px 0 0;color:#6b7280;font-size:12px;">${escapeHtml(input.footerAddress)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AST weekly digest</title></head>
<body style="margin:0;padding:0;background:#0b0d10;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d10;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#e7e9ee;">
    <tr><td style="padding-bottom:6px;font-size:18px;font-weight:700;">Always Scheming Terminal</td></tr>
    <tr><td style="padding-bottom:8px;color:#a6adba;">Your weekly watchlist digest</td></tr>
${sections}
    <tr><td style="padding-top:28px;border-top:1px solid #232831;color:#6b7280;font-size:12px;line-height:1.6;">
      You receive this because you watch companies on Always Scheming Terminal.<br>
      <a href="${escapeHtml(site)}/profile" style="color:#7cc4ff;">Manage your watchlist</a> ·
      <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#7cc4ff;">Unsubscribe</a>
      ${footerAddress}
    </td></tr>
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
export function buildSampleDigestAlerts(siteUrl: string): DigestAlert[] {
  const base = siteUrl.replace(/\/+$/, "");
  return [
    {
      entityName: "Acme Games",
      signalType: "acquisition",
      summary:
        "SAMPLE — Acme Games acquires Pixel Forge for $120M in a cash-and-stock deal.",
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
        "SAMPLE — Northstar Interactive raises a $45M Series B led by Horizon Ventures.",
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
        "SAMPLE — Cobalt Studios cuts 80 roles as its live-service project winds down.",
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
}
