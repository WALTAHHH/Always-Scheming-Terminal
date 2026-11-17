import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, DELETE } from './route';

// --- Mock supabase-server (auth-scoped client: watchlists rows) ---
let mockAuthGetSession = vi.fn();
let mockFrom = vi.fn();
// --- Mock supabase (service-role client: the `entities` existence probe) ---
let mockServiceFrom = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createAuthServerClient: vi.fn(() => ({
    auth: { getSession: mockAuthGetSession },
    from: mockFrom,
  })),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({ from: mockServiceFrom })),
}));

// Helper to create a mock builder that returns a promise with { data, error }
function createMockBuilder(result: { data?: any; error?: any }) {
  const builder: any = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    then: vi.fn((onFulfilled) => Promise.resolve(result).then(onFulfilled)),
    catch: vi.fn((onRejected) => Promise.resolve(result).catch(onRejected)),
  };
  return builder;
}

// A syntactically valid UUID used as the "happy path" entity id. The API now
// rejects non-UUID ids with a 400 before any query runs.
const PUBLIC_ENTITY_ID = '11111111-1111-4111-8111-111111111111';

// Wire the mocks so POST's two-table flow works: the `entities` existence probe
// runs on the service-role client (mockServiceFrom) and the actual write runs on
// the auth-scoped client (mockFrom → `watchlists`).
function wirePostMocks(
  entityResult: { data?: any; error?: any },
  watchlistResult: { data?: any; error?: any } = { data: null, error: null }
) {
  const entityBuilder = createMockBuilder(entityResult);
  const watchlistBuilder = createMockBuilder(watchlistResult);
  mockServiceFrom.mockImplementation((table: string) => {
    if (table !== 'entities') throw new Error(`unexpected service-role table: ${table}`);
    return entityBuilder;
  });
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'watchlists') throw new Error(`unexpected auth-scoped table: ${table}`);
    return watchlistBuilder;
  });
  return { entityBuilder, watchlistBuilder };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/watchlist', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const response = await GET();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns empty watchlist when user has none', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      data: [],
      entity_ids: [],
      count: 0,
    });
    expect(mockBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(mockBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns watchlist with embedded entity', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockData = [
      {
        id: 'watch-1',
        entity_id: PUBLIC_ENTITY_ID,
        created_at: '2026-01-01T00:00:00Z',
        entity: {
          id: PUBLIC_ENTITY_ID,
          canonical_name: 'Apple Inc.',
          ticker: 'AAPL',
          exchange: 'NASDAQ',
          entity_type: 'company',
          is_public: true,
        },
      },
    ];
    const mockBuilder = createMockBuilder({ data: mockData, error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual(mockData);
    expect(body.entity_ids).toEqual([PUBLIC_ENTITY_ID]);
    expect(body.count).toBe(1);
    // Verify select includes entity embed
    expect(mockBuilder.select).toHaveBeenCalledWith(
      'id, entity_id, created_at, entity:entities(id, canonical_name, ticker, exchange, entity_type, is_public)'
    );
  });

  it('returns 500 on database error', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({
      data: null,
      error: new Error('DB error'),
    });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to load watchlist');
  });
});

describe('POST /api/v1/watchlist', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: PUBLIC_ENTITY_ID }),
    }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when entity_id missing', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({}),
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('entity_id is required');
  });

  it('returns 400 when entity_id is empty string', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: '' }),
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('entity_id is required');
  });

  it('returns 400 on invalid JSON', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: 'invalid json',
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid JSON body');
  });

  // --- UUID validation (acceptance criterion 1) ---
  it('returns 400 for a malformed (non-UUID) entity_id without querying', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const { entityBuilder, watchlistBuilder } = wirePostMocks({ data: { id: 'x' } });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: 'ent-1' }),
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('entity_id must be a valid UUID');
    // Never touched the DB — the malformed id must not reach Postgres.
    expect(mockFrom).not.toHaveBeenCalled();
    expect(entityBuilder.select).not.toHaveBeenCalled();
    expect(watchlistBuilder.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 for a UUID-shaped string of the wrong length', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: '11111111-1111-4111-8111-11111111111' }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('entity_id must be a valid UUID');
  });

  // --- Existence gate (acceptance criterion 2) ---
  it('returns 404 when the entity does not exist', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    // maybeSingle with a non-matching filter yields { data: null, error: null }.
    const { entityBuilder, watchlistBuilder } = wirePostMocks({ data: null, error: null });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: PUBLIC_ENTITY_ID }),
    }));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Entity not found');
    expect(body.code).toBe('entity_not_found');
    // The probe ran on the service-role client, keyed on the id only.
    expect(mockServiceFrom).toHaveBeenCalledWith('entities');
    expect(entityBuilder.eq).toHaveBeenCalledWith('id', PUBLIC_ENTITY_ID);
    // No watchlist row was written.
    expect(watchlistBuilder.upsert).not.toHaveBeenCalled();
  });

  // --- Regression: AST t_7a718c60 (Watch button reverted on Take-Two) ---
  // The drawer renders entities straight from `/api/v1/entities` (service role,
  // no is_public filter). A non-public / RLS-hidden row must therefore still be
  // followable, otherwise the star can only ever flash and revert.
  it('regression: follows an entity that exists but is NOT public', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    // The probe returns the row → the entity exists, whatever is_public says.
    const { entityBuilder, watchlistBuilder } = wirePostMocks({
      data: { id: PUBLIC_ENTITY_ID },
      error: null,
    });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: PUBLIC_ENTITY_ID }),
    }));

    expect(response.status).toBe(201);
    expect(watchlistBuilder.upsert).toHaveBeenCalled();
    // The gate no longer filters on is_public — that filter is what 404'd TTWO.
    expect(entityBuilder.eq).not.toHaveBeenCalledWith('is_public', true);
  });

  it('regression: the existence probe never uses the auth-scoped client', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    // RLS on `entities` (even once tightened) must not be able to turn a
    // followable entity into a 404: only `watchlists` goes through the
    // auth-scoped client.
    wirePostMocks({ data: { id: PUBLIC_ENTITY_ID }, error: null });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: PUBLIC_ENTITY_ID }),
    }));

    expect(response.status).toBe(201);
    expect(mockFrom).not.toHaveBeenCalledWith('entities');
    expect(mockServiceFrom).toHaveBeenCalledWith('entities');
  });

  it('returns 500 when the entity verification query fails', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const { watchlistBuilder } = wirePostMocks({ data: null, error: new Error('DB error') });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: PUBLIC_ENTITY_ID }),
    }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to verify entity');
    expect(body.code).toBe('entity_verify_failed');
    expect(watchlistBuilder.upsert).not.toHaveBeenCalled();
  });

  // --- Success path: public entity ---
  it('creates watchlist entry for a public entity and returns 201', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const { watchlistBuilder } = wirePostMocks({ data: { id: PUBLIC_ENTITY_ID }, error: null });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: PUBLIC_ENTITY_ID }),
    }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      entity_id: PUBLIC_ENTITY_ID,
      watching: true,
    });
    expect(watchlistBuilder.upsert).toHaveBeenCalledWith(
      { user_id: 'user-123', entity_id: PUBLIC_ENTITY_ID },
      { onConflict: 'user_id,entity_id', ignoreDuplicates: true }
    );
  });

  it('is idempotent — returns 201 even when row already exists', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    wirePostMocks({ data: { id: PUBLIC_ENTITY_ID }, error: null });

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: PUBLIC_ENTITY_ID }),
    }));
    // Should still be 201, not 409
    expect(response.status).toBe(201);
  });

  it('returns 500 on watchlist database error', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    wirePostMocks(
      { data: { id: PUBLIC_ENTITY_ID }, error: null },
      { data: null, error: new Error('DB error') }
    );

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: PUBLIC_ENTITY_ID }),
    }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to add to watchlist');
  });
});

describe('DELETE /api/v1/watchlist', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const response = await DELETE(new Request(`http://localhost/api/v1/watchlist?entity_id=${PUBLIC_ENTITY_ID}`));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when entity_id query param missing', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });

    const response = await DELETE(new Request('http://localhost/api/v1/watchlist'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('entity_id query parameter is required');
  });

  // --- UUID validation (acceptance criterion 3) ---
  it('returns 400 for a malformed entity_id query param without querying', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await DELETE(new Request('http://localhost/api/v1/watchlist?entity_id=ent-1'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('entity_id must be a valid UUID');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockBuilder.delete).not.toHaveBeenCalled();
  });

  it('deletes watchlist entry and returns 200', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await DELETE(new Request(`http://localhost/api/v1/watchlist?entity_id=${PUBLIC_ENTITY_ID}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      entity_id: PUBLIC_ENTITY_ID,
      watching: false,
    });
    expect(mockBuilder.delete).toHaveBeenCalledTimes(1);
    expect(mockBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(mockBuilder.eq).toHaveBeenCalledWith('entity_id', PUBLIC_ENTITY_ID);
  });

  it('is idempotent — returns 200 even when row does not exist', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await DELETE(new Request(`http://localhost/api/v1/watchlist?entity_id=${PUBLIC_ENTITY_ID}`));
    expect(response.status).toBe(200);
    // Still calls delete, but idempotent
    expect(mockBuilder.delete).toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({
      data: null,
      error: new Error('DB error'),
    });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await DELETE(new Request(`http://localhost/api/v1/watchlist?entity_id=${PUBLIC_ENTITY_ID}`));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to remove from watchlist');
  });
});
