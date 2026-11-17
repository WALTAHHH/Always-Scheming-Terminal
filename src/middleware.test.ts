import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// The middleware builds a Supabase server client and calls auth.getUser().
// For logged-out callers that returns no user; we only need the shape.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
}));

import { middleware } from "@/middleware";

/** A NextResponse.next() carries x-middleware-next: 1 and status 200. */
function isPassThrough(res: Response): boolean {
  return res.status === 200 && res.headers.get("x-middleware-next") === "1";
}

describe("middleware public /unsubscribe", () => {
  it("lets GET /unsubscribe?token=... through without redirect when logged out", async () => {
    const res = await middleware(
      new NextRequest("https://terminal.always-scheming.com/unsubscribe?token=abc")
    );
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
    expect(isPassThrough(res)).toBe(true);
  });

  it("lets POST /unsubscribe (RFC 8058 one-click) through when logged out", async () => {
    const res = await middleware(
      new NextRequest("https://terminal.always-scheming.com/unsubscribe?token=abc", {
        method: "POST",
      })
    );
    expect(res.status).not.toBe(307);
    expect(isPassThrough(res)).toBe(true);
  });

  it("still redirects logged-out users away from /", async () => {
    const res = await middleware(new NextRequest("https://terminal.always-scheming.com/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/auth/login");
  });

  it("still redirects a sibling path (does not make /unsubscribe/* public)", async () => {
    const res = await middleware(
      new NextRequest("https://terminal.always-scheming.com/profile")
    );
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/auth/login");
  });

  it("does not make a look-alike path (/unsubscribe-now) public", async () => {
    const res = await middleware(
      new NextRequest("https://terminal.always-scheming.com/unsubscribe-now")
    );
    expect(res.status).toBe(307);
  });
});
