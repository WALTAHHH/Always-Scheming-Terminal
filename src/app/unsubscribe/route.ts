import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  isValidUnsubscribeTokenShape,
  unsubscribeByToken,
  unsubscribeTokenExists,
} from "@/lib/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, must-revalidate" };

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ] as string)
  );
}

function page(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · Always Scheming Terminal</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
    background:#0b0d10; color:#e7e9ee;
    font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { max-width:32rem; padding:2.5rem 1.5rem; text-align:center; }
  h1 { font-size:1.35rem; margin:0 0 .75rem; }
  p { margin:.5rem 0; color:#a6adba; }
  form { margin-top:1.5rem; }
  button { font:inherit; font-weight:600; cursor:pointer; border:0; border-radius:.6rem;
    padding:.7rem 1.4rem; background:#e7e9ee; color:#0b0d10; }
  button:hover { background:#fff; }
  a { color:#7cc4ff; }
</style>
</head>
<body><main>${inner}</main></body>
</html>`;
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE },
  });
}

/** Confirmation page shown on GET — a button POSTs to actually unsubscribe. */
function confirmPage(token: string): string {
  const t = escapeHtml(token);
  return page(
    "Unsubscribe",
    `<h1>Unsubscribe from watchlist emails</h1>
     <p>Stop receiving the weekly watchlist digest by email. Your in-app
        alerts and everything else stay exactly as they are.</p>
     <form method="post" action="/unsubscribe?token=${t}">
       <input type="hidden" name="token" value="${t}">
       <button type="submit">Unsubscribe</button>
     </form>`
  );
}

function successPage(): string {
  return page(
    "Unsubscribed",
    `<h1>You're unsubscribed</h1>
     <p>You won't receive the weekly watchlist digest anymore.</p>
     <p>You can turn it back on any time from your
        <a href="/profile">profile settings</a>.</p>`
  );
}

function invalidPage(): string {
  return page(
    "Link invalid",
    `<h1>This unsubscribe link isn't valid</h1>
     <p>It may have expired or been truncated. You can manage email
        preferences from your <a href="/profile">profile settings</a>.</p>`
  );
}

function errorPage(): string {
  return page(
    "Something went wrong",
    `<h1>Something went wrong</h1>
     <p>We couldn't process that request. Please try again shortly.</p>`
  );
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

function readBodyToken(req: NextRequest): string | null {
  const t = req.nextUrl.searchParams.get("token");
  if (t) return t;
  return null;
}

/**
 * GET is the human path (the footer link). It renders a minimal confirmation
 * page and deliberately does **not** mutate, so link prefetchers/scanners
 * cannot unsubscribe a user by fetching the URL.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get("token");

  if (!token || !isValidUnsubscribeTokenShape(token)) {
    return html(invalidPage(), 400);
  }

  const supabase = createServiceClient();
  if (!supabase) {
    console.error("[unsubscribe] service role env not configured");
    return html(errorPage(), 503);
  }

  const exists = await unsubscribeTokenExists(supabase, token);
  if (!exists) return html(invalidPage(), 404);

  return html(confirmPage(token), 200);
}

/**
 * POST is the RFC 8058 one-click path. Mail clients POST with body
 * `List-Unsubscribe=One-Click`; a browser confirms via the form on the GET
 * page. Either way we act immediately and return 200.
 */
export async function POST(req: NextRequest): Promise<Response> {
  let bodyToken: string | null = null;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      const t = form.get("token");
      if (typeof t === "string") bodyToken = t;
    } else if (ct.includes("application/json")) {
      const json = await req.json();
      if (json && typeof json.token === "string") bodyToken = json.token;
    }
  } catch {
    // RFC 8058 bodies are opaque to us; an unparseable body is not fatal.
  }

  const token = readBodyToken(req) ?? bodyToken;
  if (!token || !isValidUnsubscribeTokenShape(token)) {
    return html(invalidPage(), 400);
  }

  const supabase = createServiceClient();
  if (!supabase) {
    console.error("[unsubscribe] service role env not configured");
    return html(errorPage(), 503);
  }

  const result = await unsubscribeByToken(supabase, token);
  if (result.ok) return html(successPage(), 200);
  if (result.reason === "invalid_token") return html(invalidPage(), 400);
  if (result.reason === "not_found") return html(invalidPage(), 404);
  return html(errorPage(), 500);
}
