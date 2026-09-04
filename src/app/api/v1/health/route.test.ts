import { describe, it, expect, vi } from 'vitest';
import { GET } from './route';

describe('api/v1/health route', () => {
  it('should return 200 with JSON', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      timestamp: expect.any(String),
      build: expect.any(String),
    });
  });
});