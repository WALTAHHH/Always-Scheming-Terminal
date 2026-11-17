import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  serviceClient: { rpc: vi.fn(), from: vi.fn() } as {
    rpc: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthServerClient: vi.fn(async () => ({
    auth: { getSession: mocks.getSession },
  })),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(() => mocks.serviceClient),
}));

import { GET } from "./route";

/** A chainable stub whose terminal `.range()` resolves to the given result. */
function rangeBuilder(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = vi.fn(self);
  builder.eq = vi.fn(self);
  builder.order = vi.fn(self);
  builder.range = vi.fn(() => Promise.resolve(result));
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/tags/themes", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns DISTINCT themes with usage counts via the aggregate RPC", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
      error: null,
    });
    mocks.serviceClient.rpc.mockResolvedValue({
      data: [
        { value: "mobile", count: 12 },
        { value: "M&A", count: "3" },
      ],
      error: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(2);
    // Sorted alphabetically (localeCompare): "M&A" before "mobile".
    expect(body.tags).toEqual([
      { value: "M&A", count: 3 },
      { value: "mobile", count: 12 },
    ]);
    expect(body.themes).toEqual(["M&A", "mobile"]);
    // No raw-row scan should have happened.
    expect(mocks.serviceClient.from).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });

  it("falls back to a paginated scan when the RPC is unavailable (no 1000-row cap)", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
      error: null,
    });
    // Function not found → route must paginate instead of giving up.
    mocks.serviceClient.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });

    // Page 1 is a FULL 1000-row page (all the same theme); page 2 is short.
    const page1 = Array.from({ length: 1000 }, () => ({ value: "AAA" }));
    const page2 = [{ value: "mobile" }, { value: "mobile" }];

    mocks.serviceClient.from.mockImplementation(() => {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      builder.select = vi.fn(self);
      builder.eq = vi.fn(self);
      builder.order = vi.fn(self);
      // `.range(from, to)` decides the page, so the loop can advance.
      builder.range = vi.fn((from: number) =>
        Promise.resolve({ data: from === 0 ? page1 : page2, error: null })
      );
      return builder;
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    // The old bug dropped everything past row 1000; assert the "mobile" theme
    // from the SECOND page survived and counts are aggregated across pages.
    expect(body.tags).toContainEqual({ value: "mobile", count: 2 });
    expect(body.tags).toContainEqual({ value: "AAA", count: 1000 });
    expect(body.total).toBe(2);
  });

  it("returns 500 when both the RPC and the scan fail", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
      error: null,
    });
    mocks.serviceClient.rpc.mockResolvedValue({ data: null, error: { code: "X" } });
    mocks.serviceClient.from.mockImplementation(() => {
      const builder = rangeBuilder({ data: null, error: { message: "boom" } });
      return builder;
    });

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch themes" });
  });
});
