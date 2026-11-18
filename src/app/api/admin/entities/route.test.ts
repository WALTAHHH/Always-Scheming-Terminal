import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── mocks (hoisted) ────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: () => mocks.requireAdmin(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

import { GET } from "./route";

// ── fake PostgREST client ──────────────────────────────────────────────────

type Row = Record<string, unknown>;

const PAGE_SIZE = 1000;

/**
 * Minimal stand-in for the supabase-js query builder: records `.range()`
 * windows, applies the filters the route uses, and is awaitable when the route
 * does not call `.range()` (the entities query).
 */
function fakeClient(tables: Record<string, Row[]>, opts: { failTable?: string } = {}) {
  const windows: Record<string, { from: number; to: number }[]> = {};

  const makeBuilder = (table: string) => {
    let filtered = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      eq: (col: string, value: unknown) => {
        filtered = filtered.filter((row) => row[col] === value);
        return builder;
      },
      in: (col: string, values: unknown[]) => {
        filtered = filtered.filter((row) => values.includes(row[col]));
        return builder;
      },
      is: (col: string, value: unknown) => {
        filtered = filtered.filter((row) => (value === null ? row[col] == null : row[col] === value));
        return builder;
      },
      not: (col: string, operator: string, value: unknown) => {
        if (operator === "is" && value === null) {
          filtered = filtered.filter((row) => row[col] != null);
        }
        return builder;
      },
      range: (from: number, to: number) => {
        (windows[table] ??= []).push({ from, to });
        const result =
          opts.failTable === table
            ? { data: null, error: { code: "XX000", message: `${table} exploded` } }
            : { data: filtered.slice(from, to + 1), error: null };
        return Promise.resolve(result);
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        const result =
          opts.failTable === table
            ? { data: null, error: { code: "XX000", message: `${table} exploded` } }
            : { data: filtered, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    windows,
    client: {
      rpc: mocks.rpc,
      from: (table: string) => {
        mocks.from(table);
        return makeBuilder(table);
      },
    },
  };
}

// ── fixture ────────────────────────────────────────────────────────────────

const NVIDIA = "11111111-1111-1111-1111-111111111111";
const APPLE = "22222222-2222-2222-2222-222222222222";
const SONY = "33333333-3333-3333-3333-333333333333";

const ENTITIES: Row[] = [
  { id: NVIDIA, canonical_name: "Nvidia", entity_type: "company", segment: "semis", ticker: "NVDA", is_public: true },
  { id: APPLE, canonical_name: "Apple", entity_type: "company", segment: "hardware", ticker: "AAPL", is_public: true },
  { id: SONY, canonical_name: "Sony", entity_type: "company", segment: "gaming", ticker: "SONY", is_public: true },
];

const ALIASES: Row[] = [
  { id: "a1", entity_id: NVIDIA, alias: "Nvidia" },
  { id: "a2", entity_id: NVIDIA, alias: "NVDA" },
  { id: "a3", entity_id: APPLE, alias: "Apple" },
];

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

// c1: company tag row with entity_id NULL (value = "Nvidia") + 2 signals
// c2: resolved row + unresolved ticker value + JSONB duplicate → 1 distinct content
// c3: Apple only in content.tags JSONB + 1 signal
// c4: Apple, 40 days old → counts, outside the 30-day series
const CONTENT: Row[] = [
  { id: "c1", tags: { company: ["Nvidia"], theme: ["ai"] }, ingested_at: daysAgo(3) },
  { id: "c2", tags: { company: ["Nvidia"] }, ingested_at: daysAgo(2) },
  { id: "c3", tags: { company: ["Apple"] }, ingested_at: daysAgo(1) },
  { id: "c4", tags: { company: ["Apple"] }, ingested_at: daysAgo(40) },
  { id: "c5", tags: { company: [] }, ingested_at: daysAgo(1) },
  { id: "c6", tags: { company: "Nvidia" }, ingested_at: daysAgo(1) },
];

const CONTENT_TAGS: Row[] = [
  { id: "t1", content_id: "c1", dimension: "company", value: "Nvidia", entity_id: null },
  { id: "t2", content_id: "c2", dimension: "company", value: "Nvidia", entity_id: NVIDIA },
  { id: "t3", content_id: "c2", dimension: "company", value: "NVDA", entity_id: null },
  { id: "t4", content_id: "c5", dimension: "theme", value: "ai", entity_id: null },
];

const SIGNALS: Row[] = [
  { id: "s1", content_id: "c1" },
  { id: "s2", content_id: "c1" },
  { id: "s3", content_id: "c3" },
];

function jsonResponse(res: Response) {
  return res.json() as Promise<Record<string, any>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1" } });
});

describe("GET /api/admin/entities", () => {
  it("returns 401 when the caller is not an admin", async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const res = await GET(new Request("http://localhost/api/admin/entities") as never);
    expect(res.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("uses the admin_entity_counts() RPC and maps tag/signal counts per entity", async () => {
    const { client } = fakeClient({ entities: ENTITIES, entity_aliases: ALIASES });
    mocks.createClient.mockReturnValue(client);

    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_entity_counts") {
        return {
          data: [
            { entity_id: NVIDIA, tag_count: "2", signal_count: 2 },
            { entity_id: APPLE, tag_count: 2, signal_count: "1" },
          ],
          error: null,
        };
      }
      if (name === "admin_entity_tag_series") {
        return {
          data: [
            { entity_id: NVIDIA, day: daysAgo(3).slice(0, 10), tag_count: "1" },
            { entity_id: NVIDIA, day: daysAgo(2).slice(0, 10), tag_count: 1 },
            { entity_id: APPLE, day: daysAgo(1).slice(0, 10), tag_count: 1 },
          ],
          error: null,
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    const res = await GET(new Request("http://localhost/api/admin/entities") as never);
    expect(res.status).toBe(200);
    const body = await jsonResponse(res);

    const byName = Object.fromEntries(body.entities.map((e: Row) => [e.canonical_name, e]));
    expect(byName.Nvidia).toMatchObject({ tag_count: 2, signal_count: 2, alias_count: 2 });
    expect(byName.Apple).toMatchObject({ tag_count: 2, signal_count: 1, alias_count: 1 });
    // Entities with no tags/signals must still be 0, not missing.
    expect(byName.Sony).toMatchObject({ tag_count: 0, signal_count: 0, alias_count: 0 });

    // Top-8 series is derived from the RPC rows, dates ascending.
    expect(body.tagTimeSeries[0].entity).toBe("Nvidia");
    expect(body.tagTimeSeries[0].data).toEqual([
      { date: daysAgo(3).slice(0, 10), count: 1 },
      { date: daysAgo(2).slice(0, 10), count: 1 },
    ]);

    // The paged scans must not run when the RPC succeeded.
    expect(mocks.from).not.toHaveBeenCalledWith("content_tags");
    expect(mocks.from).not.toHaveBeenCalledWith("signals");
  });

  it("falls back to a paged scan when migration 022 has not been applied, resolving unresolved tags by alias and JSONB", async () => {
    const { client, windows } = fakeClient({
      entities: ENTITIES,
      entity_aliases: ALIASES,
      content_tags: CONTENT_TAGS,
      content: CONTENT,
      signals: SIGNALS,
    });
    mocks.createClient.mockReturnValue(client);

    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.admin_entity_counts in the schema cache" },
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await GET(new Request("http://localhost/api/admin/entities") as never);
    warn.mockRestore();

    expect(res.status).toBe(200);
    const body = await jsonResponse(res);
    const byName = Object.fromEntries(body.entities.map((e: Row) => [e.canonical_name, e]));

    // Nvidia: c1 (unresolved tag value) + c2 (resolved tag + ticker alias + JSONB dup) = 2 distinct content
    expect(byName.Nvidia).toMatchObject({ tag_count: 2, signal_count: 2 });
    // Apple: c3 + c4 come only from content.tags JSONB = 2 distinct content, 1 signal
    expect(byName.Apple).toMatchObject({ tag_count: 2, signal_count: 1 });
    expect(byName.Sony).toMatchObject({ tag_count: 0, signal_count: 0 });

    // c4 is 40 days old → not in the 30-day series
    const nvidiaSeries = body.tagTimeSeries.find((s: { entity: string }) => s.entity === "Nvidia");
    expect(nvidiaSeries.data).toEqual([
      { date: daysAgo(3).slice(0, 10), count: 1 },
      { date: daysAgo(2).slice(0, 10), count: 1 },
    ]);
    const appleSeries = body.tagTimeSeries.find((s: { entity: string }) => s.entity === "Apple");
    expect(appleSeries.data).toEqual([{ date: daysAgo(1).slice(0, 10), count: 1 }]);

    // Every scan was windowed, never a single unbounded select.
    for (const table of ["entity_aliases", "content_tags", "content", "signals"]) {
      expect(windows[table]?.[0]).toEqual({ from: 0, to: PAGE_SIZE - 1 });
    }
  });

  it("pages past the PostgREST 1000-row cap for aliases and tags", async () => {
    const manyAliases: Row[] = Array.from({ length: 1200 }, (_, i) => ({
      id: `al-${i}`,
      entity_id: NVIDIA,
      alias: `Nvidia alias ${i}`,
    }));
    const manyTags: Row[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `tg-${i}`,
      content_id: `content-${i % 1200}`,
      dimension: "company",
      value: "Nvidia",
      entity_id: null,
    }));

    const { client, windows } = fakeClient({
      entities: ENTITIES,
      entity_aliases: manyAliases,
      content_tags: manyTags,
      content: [],
      signals: [],
    });
    mocks.createClient.mockReturnValue(client);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await GET(new Request("http://localhost/api/admin/entities") as never);
    warn.mockRestore();

    expect(res.status).toBe(200);
    const body = await jsonResponse(res);
    const nvidia = body.entities.find((e: Row) => e.canonical_name === "Nvidia");

    expect(nvidia.alias_count).toBe(1200);
    expect(nvidia.tag_count).toBe(1200); // 1500 tag rows over 1200 distinct content ids
    expect(windows["entity_aliases"].length).toBe(2);
    expect(windows["content_tags"].length).toBe(2);
  });

  it("surfaces a real RPC failure instead of reporting zeros", async () => {
    const { client } = fakeClient({ entities: ENTITIES, entity_aliases: ALIASES });
    mocks.createClient.mockReturnValue(client);
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "permission denied for table content_tags" },
    });

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(new Request("http://localhost/api/admin/entities") as never);
    error.mockRestore();

    expect(res.status).toBe(500);
    const body = await jsonResponse(res);
    expect(body.detail).toContain("permission denied");
  });

  it("surfaces a fallback scan failure instead of reporting zeros", async () => {
    const { client } = fakeClient(
      { entities: ENTITIES, entity_aliases: ALIASES, content_tags: CONTENT_TAGS, content: CONTENT, signals: SIGNALS },
      { failTable: "content_tags" }
    );
    mocks.createClient.mockReturnValue(client);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await GET(new Request("http://localhost/api/admin/entities") as never);
    const loggedErrors = error.mock.calls.length;
    error.mockRestore();
    warn.mockRestore();

    expect(res.status).toBe(500);
    expect((await jsonResponse(res)).detail).toContain("content_tags exploded");
    expect(loggedErrors).toBeGreaterThan(0);
  });

  it("returns an empty payload when there are no entities", async () => {
    const { client } = fakeClient({ entities: [], entity_aliases: [] });
    mocks.createClient.mockReturnValue(client);

    const res = await GET(new Request("http://localhost/api/admin/entities") as never);
    expect(res.status).toBe(200);
    expect(await jsonResponse(res)).toEqual({ entities: [], tagTimeSeries: [] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});