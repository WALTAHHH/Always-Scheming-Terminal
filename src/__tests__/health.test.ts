import { describe, it, expect, vi } from 'vitest'
import { GET } from '@/app/api/v1/health/route'

describe('health route', () => {
  it('should return ok: true with timestamp and build', async () => {
    const mockDate = new Date('2024-01-01T00:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(mockDate)

    const response = await GET()
    const json = await response.json()
    expect(json).toEqual({
      ok: true,
      timestamp: '2024-01-01T00:00:00.000Z',
      build: 'v6'
    })

    vi.useRealTimers()
  })
})