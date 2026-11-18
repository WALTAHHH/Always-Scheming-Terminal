import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GET } from "./route";

// --- Mock the service-role Supabase client (mirrors src/app/page.tsx) ---
let mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}));

// --- Neutralise rate limiting so tests are deterministic ---
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 59, resetTime: Date.now() + 60_000 })),
  getClientIP: vi.fn(() => "127.0.0.1"),
  RATE_LIMITS: { public: { windowMs: 60_000, maxRequests: 60 } },
}));

// Postgrest-style builder that records the chain and resolves to { data, error }.
function createMockBuilder(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "gt", "lt", "range"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = vi.fn((onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled)
  );
  builder.catch = vi.fn((onRejected: (e: unknown) => unknown) =>
    Promise.resolve(result).catch(onRejected)
  );
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    then: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/feed", () => {
  it("returns items newest-first with hasMore=false when fewer than limit", async () => {
    const items = [{ id: "a" }, { id: "b" }];
    const builder = createMockBuilder({ data: items, error: null });
    mockFrom.mockReturnValue(builder);

    const res = await GET(new Request("http://localhost/api/feed?limit=50"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual(items);
    expect(body.hasMore).toBe(false);

    // Query must gate on active sources and fetch limit+1 to detect another page.
    expect(mockFrom).toHaveBeenCalledWith("content");
    expect(builder.eq).toHaveBeenCalledWith("sources.active", true);
    expect(builder.limit).toHaveBeenCalledWith(51);
  });

  it("slices back to `limit` and sets hasMore=true when limit+1 rows return", async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ id: `i${i}` }));
    const builder = createMockBuilder({ data: items, error: null });
    mockFrom.mockReturnValue(builder);

    const res = await GET(new Request("http://localhost/api/feed?limit=50"));
    const body = await res.json();
    expect(body.items).toHaveLength(50);
    expect(body.hasMore).toBe(true);
  });

  it("applies the `since` cursor as a strictly-greater-than filter (poll for new items)", async () => {
    const builder = createMockBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    const cursor = "2026-06-13T12:00:00.000Z";

    const res = await GET(
      new Request(`http://localhost/api/feed?limit=100&since=${encodeURIComponent(cursor)}`)
    );
    expect(res.status).toBe(200);
    expect(builder.gt).toHaveBeenCalledWith("published_at", cursor);
    expect(builder.lt).not.toHaveBeenCalled();
    expect(builder.limit).toHaveBeenCalledWith(101);
  });

  it("applies the `before` cursor as a strictly-less-than filter (load more)", async () => {
    const builder = createMockBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    const cursor = "2026-06-01T00:00:00.000Z";

    const res = await GET(
      new Request(`http://localhost/api/feed?limit=50&before=${encodeURIComponent(cursor)}`)
    );
    expect(res.status).toBe(200);
    expect(builder.lt).toHaveBeenCalledWith("published_at", cursor);
    expect(builder.gt).not.toHaveBeenCalled();
  });

  it("caps an oversized limit at 200", async () => {
    const builder = createMockBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await GET(new Request("http://localhost/api/feed?limit=99999"));
    expect(builder.limit).toHaveBeenCalledWith(201);
  });

  it("surfaces a Supabase error as a 500", async () => {
    const builder = createMockBuilder({ data: null, error: { message: "boom" } });
    mockFrom.mockReturnValue(builder);

    const res = await GET(new Request("http://localhost/api/feed"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

// Regression guard for this card: the LiveFeed client must never call the
// deleted /api/items route again (it 404'd on every poll cycle). A source scan
// is the most direct, deterministic way to assert the dead endpoint is gone.
describe("LiveFeed no longer references the deleted /api/items route", () => {
  it("contains no fetch to /api/items", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/LiveFeed.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/\/api\/items\b/);
    // And it does call the replacement endpoint.
    expect(src).toMatch(/\/api\/feed\b/);
  });
});
