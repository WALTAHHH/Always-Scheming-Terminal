import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// --- Mocks (hoisted so the route's imports resolve to them) ---
const { mockFrom, mockRequireAdmin } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRequireAdmin: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: mockRequireAdmin,
}));

import { GET } from './route';

type Result = { data: any; error: any };

/**
 * Minimal thenable PostgREST-ish query builder. Every `await` pops the next
 * queued result (the last one repeats), so a paginated query can be exercised
 * with a queue of pages. All chain methods return the same builder.
 */
function makeBuilder(results: Result | Result[]): any {
  const queue: Result[] = Array.isArray(results) ? [...results] : [results];
  const builder: any = {};
  const chain = () => builder;
  for (const method of ['select', 'in', 'order', 'range', 'eq', 'not', 'gte', 'limit']) {
    builder[method] = vi.fn(chain);
  }
  builder.then = (onFulfilled: any, onRejected: any) => {
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    return Promise.resolve(next).then(onFulfilled, onRejected);
  };
  return builder;
}

interface WireArgs {
  entities?: Result | Result[];
  aliases?: Result | Result[];
  tags?: Result;
  signals?: Result;
  timeSeries?: Result;
}

function wire({
  entities = { data: [], error: null },
  aliases = { data: [], error: null },
  tags = { data: [], error: null },
  signals = { data: [], error: null },
  timeSeries = { data: [], error: null },
}: WireArgs = {}) {
  const builders = {
    entities: makeBuilder(entities),
    aliases: makeBuilder(aliases),
    tags: makeBuilder(tags),
    signals: makeBuilder(signals),
    timeSeries: makeBuilder(timeSeries),
  };
  // content_tags is queried twice: block 3 (counts) then block 7 (time series).
  let contentTagsCall = 0;
  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'entities':
        return builders.entities;
      case 'entity_aliases':
        return builders.aliases;
      case 'signals':
        return builders.signals;
      case 'content_tags':
        contentTagsCall += 1;
        return contentTagsCall === 1 ? builders.tags : builders.timeSeries;
      default:
        return makeBuilder({ data: [], error: null });
    }
  });
  return builders;
}

const NVDA = '11111111-1111-4111-8111-111111111111';
const SONY = '22222222-2222-4222-8222-222222222222';

function entityRow(id: string, canonical_name: string, ticker: string) {
  return {
    id,
    canonical_name,
    entity_type: 'company',
    segment: 'semis',
    ticker,
    is_public: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ userId: 'admin-1' });
});

describe('GET /api/admin/entities', () => {
  it('returns the real alias list per entity and keeps alias_count consistent', async () => {
    const { aliases } = wire({
      entities: {
        data: [entityRow(NVDA, 'Nvidia', 'NVDA'), entityRow(SONY, 'Sony', 'SONY')],
        error: null,
      },
      aliases: {
        data: [
          { entity_id: NVDA, alias: 'NVDA' },
          { entity_id: NVDA, alias: 'Nvidia Corp' },
          { entity_id: SONY, alias: 'Sony Group' },
        ],
        error: null,
      },
    });

    const res = await GET({} as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    const nvidia = body.entities.find((e: any) => e.id === NVDA);
    // case-insensitive sort → 'NVDA' before 'Nvidia Corp' ('d' < 'i')
    expect(nvidia.aliases).toEqual(['NVDA', 'Nvidia Corp']);
    expect(nvidia.alias_count).toBe(nvidia.aliases.length);
    expect(nvidia.alias_count).toBe(2);

    const sony = body.entities.find((e: any) => e.id === SONY);
    expect(sony.aliases).toEqual(['Sony Group']);
    expect(sony.alias_count).toBe(1);

    // The aliases query must ask for the name column, not just entity_id.
    expect(aliases.select).toHaveBeenCalledWith('entity_id, alias');
    expect(aliases.in).toHaveBeenCalledWith('entity_id', [NVDA, SONY]);
    expect(aliases.order).toHaveBeenCalledWith('id', { ascending: true });
  });

  it('returns an empty array (not null) for an entity with no aliases', async () => {
    wire({
      entities: { data: [entityRow(NVDA, 'Nvidia', 'NVDA')], error: null },
      aliases: { data: [], error: null },
    });

    const res = await GET({} as any);
    const body = await res.json();

    expect(body.entities[0].aliases).toEqual([]);
    expect(body.entities[0].alias_count).toBe(0);
  });

  it('pages through entity_aliases to beat the PostgREST 1000-row cap', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      entity_id: NVDA,
      alias: `alias-${String(i).padStart(4, '0')}`,
    }));
    const page2 = [{ entity_id: NVDA, alias: 'zzz-last' }];

    const { aliases } = wire({
      entities: { data: [entityRow(NVDA, 'Nvidia', 'NVDA')], error: null },
      aliases: [{ data: page1, error: null }, { data: page2, error: null }],
    });

    const res = await GET({} as any);
    const body = await res.json();

    expect(body.entities[0].aliases).toHaveLength(1001);
    expect(body.entities[0].alias_count).toBe(1001);
    expect(aliases.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(aliases.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('short-circuits when there are no entities', async () => {
    const { aliases } = wire({ entities: { data: [], error: null } });

    const res = await GET({} as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entities: [], tagTimeSeries: [] });
    expect(aliases.select).not.toHaveBeenCalled();
  });

  it('surfaces an alias-query failure as a 500 instead of swallowing it', async () => {
    wire({
      entities: { data: [entityRow(NVDA, 'Nvidia', 'NVDA')], error: null },
      aliases: { data: null, error: new Error('boom') },
    });

    const res = await GET({} as any);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to fetch entities stats');
  });

  it('returns the auth response unchanged when the caller is not an admin', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const res = await GET({} as any);
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
