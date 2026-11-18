import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  authFrom: vi.fn(),
  serviceClient: { rpc: vi.fn(), from: vi.fn() } as {
    rpc: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthServerClient: vi.fn(async () => ({
    auth: { getSession: mocks.getSession },
    from: mocks.authFrom,
  })),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(() => mocks.serviceClient),
}));

import { PATCH } from "./route";

/**
 * Wire the auth-scoped client: `select("interests")…maybeSingle()` returns the
 * currently-stored preferences row; every `update(...).eq(...)` resolves clean.
 */
function wireAuthClient(storedInterests: string[] | null) {
  mocks.authFrom.mockImplementation((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() =>
          Promise.resolve({
            data:
              table === "user_preferences" && storedInterests
                ? { interests: storedInterests }
                : null,
            error: null,
          })
        ),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  }));
}

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/user/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const session = () => ({
  data: { session: { user: { id: "u1", email: "u@example.com" } } },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session());
  // Happy path: catalogue contains "mobile" and "AI".
  mocks.serviceClient.rpc.mockResolvedValue({
    data: [
      { value: "mobile", count: 5 },
      { value: "AI", count: 2 },
    ],
    error: null,
  });
});

describe("PATCH /api/user/preferences — interest validation", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    wireAuthClient(null);

    const res = await PATCH(patchRequest({ interests: ["mobile"] }));
    expect(res.status).toBe(401);
  });

  it("rejects a non-string-array interests payload with 400", async () => {
    wireAuthClient(null);
    const res = await PATCH(patchRequest({ interests: "mobile" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/array of strings/);
  });

  it("rejects a free-text interest that matches no known tag (400 + list)", async () => {
    wireAuthClient(null);
    const res = await PATCH(
      patchRequest({ interests: ["mobile", "totally-made-up"] })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Unknown interests");
    expect(body.unknown).toEqual(["totally-made-up"]);
  });

  it("accepts interests drawn from the existing catalogue", async () => {
    wireAuthClient(null);
    const res = await PATCH(patchRequest({ interests: ["mobile", "AI"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("keeps previously-saved legacy interests that are no longer in the catalogue", async () => {
    // "retired-theme" was saved earlier but is not in the live catalogue.
    wireAuthClient(["retired-theme"]);
    const res = await PATCH(
      patchRequest({ interests: ["mobile", "retired-theme"] })
    );
    expect(res.status).toBe(200);
    // Still rejects a genuinely unknown value even alongside a legacy one...
    const res2 = await PATCH(
      patchRequest({ interests: ["retired-theme", "brand-new"] })
    );
    expect(res2.status).toBe(400);
    expect((await res2.json()).unknown).toEqual(["brand-new"]);
  });

  it("validates via the paginated fallback when the RPC is missing", async () => {
    wireAuthClient(null);
    mocks.serviceClient.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    mocks.serviceClient.from.mockImplementation(() => {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      builder.select = vi.fn(self);
      builder.eq = vi.fn(self);
      builder.order = vi.fn(self);
      builder.range = vi.fn(() =>
        Promise.resolve({ data: [{ value: "mobile" }], error: null })
      );
      return builder;
    });

    const ok = await PATCH(patchRequest({ interests: ["mobile"] }));
    expect(ok.status).toBe(200);

    const bad = await PATCH(patchRequest({ interests: ["nope"] }));
    expect(bad.status).toBe(400);
  });
});
