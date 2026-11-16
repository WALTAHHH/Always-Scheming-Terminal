import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, DELETE } from './route';

// --- Mock supabase-server ---
let mockAuthGetSession = vi.fn();
let mockFrom = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createAuthServerClient: vi.fn(() => ({
    auth: { getSession: mockAuthGetSession },
    from: mockFrom,
  })),
}));

// Helper to create a mock builder that returns a promise with { data, error }
function createMockBuilder(result: { data?: any; error?: any }) {
  const builder = {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    then: vi.fn((onFulfilled) => Promise.resolve(result).then(onFulfilled)),
    catch: vi.fn((onRejected) => Promise.resolve(result).catch(onRejected)),
  };
  return builder;
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
        entity_id: 'ent-1',
        created_at: '2026-01-01T00:00:00Z',
        entity: {
          id: 'ent-1',
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
    expect(body.entity_ids).toEqual(['ent-1']);
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
      body: JSON.stringify({ entity_id: 'ent-1' }),
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

  it('creates watchlist entry and returns 201', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: 'ent-1' }),
    }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      entity_id: 'ent-1',
      watching: true,
    });
    expect(mockBuilder.upsert).toHaveBeenCalledWith(
      { user_id: 'user-123', entity_id: 'ent-1' },
      { onConflict: 'user_id,entity_id', ignoreDuplicates: true }
    );
  });

  it('is idempotent — returns 201 even when row already exists', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: 'ent-1' }),
    }));
    // Should still be 201, not 409
    expect(response.status).toBe(201);
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

    const response = await POST(new Request('http://localhost/api/v1/watchlist', {
      method: 'POST',
      body: JSON.stringify({ entity_id: 'ent-1' }),
    }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to add to watchlist');
  });
});

describe('DELETE /api/v1/watchlist', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockAuthGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const response = await DELETE(new Request('http://localhost/api/v1/watchlist?entity_id=ent-1'));
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

  it('deletes watchlist entry and returns 200', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await DELETE(new Request('http://localhost/api/v1/watchlist?entity_id=ent-1'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      entity_id: 'ent-1',
      watching: false,
    });
    expect(mockBuilder.delete).toHaveBeenCalledTimes(1);
    expect(mockBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(mockBuilder.eq).toHaveBeenCalledWith('entity_id', 'ent-1');
  });

  it('is idempotent — returns 200 even when row does not exist', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });
    const mockBuilder = createMockBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await DELETE(new Request('http://localhost/api/v1/watchlist?entity_id=ent-1'));
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

    const response = await DELETE(new Request('http://localhost/api/v1/watchlist?entity_id=ent-1'));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to remove from watchlist');
  });
});