import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from './route';
import { PATCH as PATCH_SINGLE } from './[id]/route';

// --- Mock supabase-server ---
let mockAuthGetUser = vi.fn();
let mockFrom = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createAuthServerClient: vi.fn(() => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}));

// Helper to create a mock builder that mimics supabase-js PostgrestBuilder
function createMockBuilder(result: { data?: any; count?: number; error?: any }) {
  const builder = {
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    in: vi.fn(() => builder),
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: vi.fn((onFulfilled) => Promise.resolve(result).then(onFulfilled)),
    catch: vi.fn((onRejected) => Promise.resolve(result).catch(onRejected)),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Valid UUID for tests
const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_UUID2 = '223e4567-e89b-12d3-a456-426614174000';

describe('GET /api/v1/alerts', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(new Request('http://localhost/api/v1/alerts'));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns unread count when ?unread=1', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    
    const mockBuilder = createMockBuilder({ count: 5, error: null });
    mockFrom.mockReturnValue(mockBuilder);

    const response = await GET(new Request('http://localhost/api/v1/alerts?unread=1'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ unread: 5 });
    // Verify the query chain
    expect(mockFrom).toHaveBeenCalledWith('alert_events');
    expect(mockBuilder.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(mockBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(mockBuilder.is).toHaveBeenCalledWith('read_at', null);
  });

  it('returns unread-only list when ?unread_only=1', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    
    // Mock count query
    const countBuilder = createMockBuilder({ count: 2, error: null });
    // Mock list query
    const listBuilder = createMockBuilder({
      data: [
        { id: VALID_UUID, signal_id: 'sig-1', read_at: null, score: 0.8 },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(countBuilder);
    mockFrom.mockReturnValueOnce(listBuilder);

    const response = await GET(new Request('http://localhost/api/v1/alerts?unread_only=1'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.alerts).toHaveLength(1);
    expect(body.unread).toBe(2);
    expect(listBuilder.is).toHaveBeenCalledWith('read_at', null);
  });

  it('returns paginated results with cursor', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

    // Mock count query
    const countBuilder = createMockBuilder({ count: 5, error: null });
    // Mock list query with limit
    const listBuilder = createMockBuilder({
      data: [
        { id: VALID_UUID, signal_id: 'sig-1', read_at: null, score: 0.8, created_at: '2026-01-01T00:00:00Z' },
        { id: VALID_UUID2, signal_id: 'sig-2', read_at: null, score: 0.9, created_at: '2026-01-02T00:00:00Z' },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(countBuilder);
    mockFrom.mockReturnValueOnce(listBuilder);

    const response = await GET(new Request('http://localhost/api/v1/alerts?limit=2'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.alerts).toHaveLength(2);
    expect(body.unread).toBe(5);
    expect(body.next_cursor).toBe('2026-01-02T00:00:00Z');
    expect(listBuilder.limit).toHaveBeenCalledWith(2);
  });

  it('applies cursor filter', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

    const countBuilder = createMockBuilder({ count: 0, error: null });
    const listBuilder = createMockBuilder({ data: [], error: null });
    mockFrom.mockReturnValueOnce(countBuilder);
    mockFrom.mockReturnValueOnce(listBuilder);

    const response = await GET(new Request('http://localhost/api/v1/alerts?cursor=2026-01-03T00:00:00Z'));
    expect(response.status).toBe(200);
    expect(listBuilder.lt).toHaveBeenCalledWith('created_at', '2026-01-03T00:00:00Z');
  });

  it('includes score field in alert rows', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

    const countBuilder = createMockBuilder({ count: 1, error: null });
    const listBuilder = createMockBuilder({
      data: [
        { id: VALID_UUID, signal_id: 'sig-1', read_at: null, score: 0.8 },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(countBuilder);
    mockFrom.mockReturnValueOnce(listBuilder);

    const response = await GET(new Request('http://localhost/api/v1/alerts'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.alerts[0].score).toBe(0.8);
  });
});

describe('PATCH /api/v1/alerts (bulk)', () => {
  it('requires authentication', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await PATCH(new Request('http://localhost/api/v1/alerts', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [VALID_UUID] }),
    }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('validates request body', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

    const response = await PATCH(new Request('http://localhost/api/v1/alerts', {
      method: 'PATCH',
      body: 'invalid',
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid JSON body');
  });

  it('requires ids[] or all:true', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

    const response = await PATCH(new Request('http://localhost/api/v1/alerts', {
      method: 'PATCH',
      body: JSON.stringify({}),
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Provide ids[] or all: true');
  });

  it('marks specific alerts read', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    
    const updateBuilder = createMockBuilder({
      data: [{ id: 'updated-1' }, { id: 'updated-2' }],
      error: null,
    });
    mockFrom.mockReturnValueOnce(updateBuilder);

    const response = await PATCH(new Request('http://localhost/api/v1/alerts', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [VALID_UUID, VALID_UUID2] }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.updated).toBe(2);
    expect(updateBuilder.in).toHaveBeenCalledWith('id', [VALID_UUID, VALID_UUID2]);
    expect(updateBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it('returns zero updated when alert belongs to another user', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    
    const updateBuilder = createMockBuilder({ data: [], error: null });
    mockFrom.mockReturnValueOnce(updateBuilder);

    const response = await PATCH(new Request('http://localhost/api/v1/alerts', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [VALID_UUID] }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.updated).toBe(0);
    expect(updateBuilder.in).toHaveBeenCalledWith('id', [VALID_UUID]);
    expect(updateBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
  });
});

describe('PATCH /api/v1/alerts/[id]', () => {
  it('validates UUID format', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

    const response = await PATCH_SINGLE(
      new Request('http://localhost/api/v1/alerts/invalid-id', {
        method: 'PATCH',
      }),
      { params: Promise.resolve({ id: 'invalid-id' }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid alert id');
  });

  it('returns 404 for non-existent alert', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    
    const updateBuilder = createMockBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(updateBuilder);

    const response = await PATCH_SINGLE(
      new Request(`http://localhost/api/v1/alerts/${VALID_UUID}`, {
        method: 'PATCH',
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Alert not found');
  });

  it('marks a single alert read', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    
    const updateBuilder = createMockBuilder({
      data: { id: VALID_UUID, read_at: '2026-01-01T00:00:00Z' },
      error: null,
    });
    mockFrom.mockReturnValueOnce(updateBuilder);

    const response = await PATCH_SINGLE(
      new Request(`http://localhost/api/v1/alerts/${VALID_UUID}`, {
        method: 'PATCH',
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(VALID_UUID);
    expect(body.read_at).toBeDefined();
  });

  it('validates ownership via user_id filter', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    
    const updateBuilder = createMockBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(updateBuilder);

    const response = await PATCH_SINGLE(
      new Request(`http://localhost/api/v1/alerts/${VALID_UUID}`, {
        method: 'PATCH',
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(response.status).toBe(404);
    expect(updateBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
  });
});
