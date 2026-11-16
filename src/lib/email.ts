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

import { createHmac, randomBytes } from "crypto";

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
      `[email] Resend not configured (RESEND_API_KEY/DIGEST_FROM unset) — skipping send to ${input.to}`,
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
      const detail = await res.text().catch(() => "");
      console.error(`[email] Resend rejected send to ${input.to}: ${res.status} ${detail}`);
      return { ok: false, error: `resend_${res.status}` };
    }

    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] Resend send to ${input.to} threw:`, message);
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
  const out: string[] = [];
  for (const [entity, alerts] of groupDigestAlerts(input.alerts)) {
    out.push(`${entity}`);
    out.push("=".repeat(entity.length));
    for (const a of alerts) {
      out.push(
        `- [${humanSignalType(a.signalType)}] ${a.summary} (score ${a.score.toFixed(2)})`,
      );
      // Only absolute http(s) URLs are printed; a disallowed scheme is omitted
      // entirely while the rest of the digest still goes out.
      const link = safeDigestUrl(a.url);
      if (link) out.push(`  ${link}`);
    }
    out.push("");
  }
  out.push("—");
  out.push("You receive this because you watch companies on Always Scheming Terminal.");
  out.push(`Manage your watchlist: ${input.siteUrl ?? getSiteUrl()}/profile`);
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
      const rows = alerts
        .map((a) => {
          const type = escapeHtml(humanSignalType(a.signalType));
          const summary = escapeHtml(a.summary);
          // Reject non-http(s) schemes before they reach an href; a rejected
          // article degrades to plain text with an "invalid link" note.
          const safeUrl = safeDigestUrl(a.url);
          const title = safeUrl
            ? `<a href="${escapeHtml(safeUrl)}" style="color:#e7e9ee;text-decoration:none;font-size:15px;line-height:1.45;">${summary}</a>`
            : `<span style="color:#e7e9ee;font-size:15px;line-height:1.45;">${summary}</span>
      <span style="color:#6b7280;font-size:12px;"> (link unavailable)</span>`;
          return `<tr>
  <td style="padding:10px 0;border-bottom:1px solid #232831;">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7cc4ff;margin-bottom:4px;">
      ${type} · score ${a.score.toFixed(2)}
    </div>
    ${title}
  </td>
</tr>`;
        })
        .join("\n");

      return `<tr>
  <td style="padding:20px 0 4px;font-size:16px;font-weight:700;color:#e7e9ee;">${escapeHtml(entity)}</td>
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
