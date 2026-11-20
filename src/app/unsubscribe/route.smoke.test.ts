import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Fake service-role client backed by an in-memory row.
let row: { user_id: string; notification_prefs: any } | null = null;
let rowToken: string | null = null;
let updateShouldFail = false;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from() {
      const q: any = {
        _cols: "",
        _eqCol: "",
        _eqVal: "",
        select(cols: string) {
          q._cols = cols;
          return q;
        },
        eq(col: string, val: string) {
          q._eqCol = col;
          q._eqVal = val;
          return q;
        },
        update() {
          return q;
        },
        async maybeSingle() {
          const matches =
            q._cols.includes("user_id") &&
            q._eqCol === "digest_unsub_token" &&
            rowToken !== null &&
            q._eqVal === rowToken;
          return { data: matches ? row : null, error: null };
        },
        // update().eq() awaited
        then(resolve: any) {
          if (updateShouldFail) {
            resolve({ error: { message: "boom" } });
          } else if (row) {
            row.notification_prefs = { ...row.notification_prefs, watchlist_email: false };
            resolve({ error: null });
          } else {
            resolve({ error: null });
          }
        },
      };
      return q;
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

import { GET, POST } from "@/app/unsubscribe/route";
import {
  generateUnsubscribeToken,
  isValidUnsubscribeTokenShape,
  buildUnsubscribeUrl,
  buildListUnsubscribeHeaders,
} from "@/lib/unsubscribe";

const VALID = "a".repeat(64);

beforeEach(() => {
  row = null;
  rowToken = null;
  updateShouldFail = false;
});

describe("token helpers", () => {
  it("generates a 64-char hex token", () => {
    const t = generateUnsubscribeToken();
    expect(t).toMatch(/^[a-f0-9]{64}$/);
    expect(generateUnsubscribeToken()).not.toBe(t);
  });
  it("validates shape", () => {
    expect(isValidUnsubscribeTokenShape(VALID)).toBe(true);
    expect(isValidUnsubscribeTokenShape("short")).toBe(false);
    expect(isValidUnsubscribeTokenShape("z".repeat(64))).toBe(false);
    expect(isValidUnsubscribeTokenShape(undefined)).toBe(false);
  });
  it("builds url + headers", () => {
    expect(buildUnsubscribeUrl("abc", "https://x.com/")).toBe("https://x.com/unsubscribe?token=abc");
    const h = buildListUnsubscribeHeaders("abc", { baseUrl: "https://x.com", mailto: "u@x.com" });
    expect(h["List-Unsubscribe"]).toContain("<https://x.com/unsubscribe?token=abc>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("GET route", () => {
  it("400 on malformed token with incomplete-link copy", async () => {
    const res = await GET(new NextRequest("http://x/unsubscribe?token=bad"));
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("This link looks incomplete");
    expect(body).toContain("cut off");
    expect(body).not.toContain("We don't recognise this link");
    expect(body).not.toContain("@"); // leaks nothing
  });
  it("404 when token unknown with not-recognised copy", async () => {
    row = null;
    const res = await GET(new NextRequest(`http://x/unsubscribe?token=${VALID}`));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("We don't recognise this link");
    expect(body).toContain("already unsubscribed");
    expect(body).toContain('href="/profile"');
    expect(body).not.toContain("This link looks incomplete");
    expect(body).not.toContain("@"); // leaks nothing about users
  });
  it("200 confirmation page on valid token, no mutation", async () => {
    row = { user_id: "u1", notification_prefs: { watchlist_email: true } }; rowToken = VALID;
    const res = await GET(new NextRequest(`http://x/unsubscribe?token=${VALID}`));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<form method=\"post\"");
    expect(row.notification_prefs.watchlist_email).toBe(true); // GET did not mutate
  });
  it("503 when service env missing", async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await GET(new NextRequest(`http://x/unsubscribe?token=${VALID}`));
    expect(res.status).toBe(503);
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });
});

describe("POST route (RFC 8058 one-click)", () => {
  it("unsubscribes valid token -> 200", async () => {
    row = { user_id: "u1", notification_prefs: { digest: true, watchlist_email: true } }; rowToken = VALID;
    const req = new NextRequest(`http://x/unsubscribe?token=${VALID}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(row!.notification_prefs.watchlist_email).toBe(false);
    expect(row!.notification_prefs.digest).toBe(true); // other prefs preserved
  });
  it("is idempotent on replay", async () => {
    row = { user_id: "u1", notification_prefs: { watchlist_email: false } }; rowToken = VALID;
    const req = new NextRequest(`http://x/unsubscribe?token=${VALID}`, { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
  it("400 on malformed token, no mutation", async () => {
    row = { user_id: "u1", notification_prefs: { watchlist_email: true } }; rowToken = VALID;
    const res = await POST(new NextRequest("http://x/unsubscribe?token=zzz", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(row!.notification_prefs.watchlist_email).toBe(true);
  });
  it("404 unknown token", async () => {
    row = null;
    const res = await POST(new NextRequest(`http://x/unsubscribe?token=${VALID}`, { method: "POST" }));
    expect(res.status).toBe(404);
  });
  it("500 on db error", async () => {
    row = { user_id: "u1", notification_prefs: { watchlist_email: true } }; rowToken = VALID;
    updateShouldFail = true;
    const res = await POST(new NextRequest(`http://x/unsubscribe?token=${VALID}`, { method: "POST" }));
    expect(res.status).toBe(500);
  });
  it("cannot target another user without their token", async () => {
    row = { user_id: "u1", notification_prefs: { watchlist_email: true } }; rowToken = VALID;
    const other = "b".repeat(64);
    const res = await POST(new NextRequest(`http://x/unsubscribe?token=${other}`, { method: "POST" }));
    expect(res.status).toBe(404);
    expect(row!.notification_prefs.watchlist_email).toBe(true);
  });
});
