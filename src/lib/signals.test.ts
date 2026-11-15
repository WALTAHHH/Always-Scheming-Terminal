import { describe, it, expect } from 'vitest';
import { sortSignalsByEventDate, type SortableSignal } from './signals';

function s(
  id: string,
  published_at: string | null,
  created_at: string | null = null,
  score = 0.5,
): SortableSignal {
  return { id, published_at, created_at, investment_relevance_score: score };
}

describe('sortSignalsByEventDate()', () => {
  it('orders newest event date first (the reported bug: Sep 27 must not trail Sep 25)', () => {
    const input = [
      s('a', '2026-11-06T00:00:00Z'),
      s('b', '2026-10-28T00:00:00Z'),
      s('c', '2026-10-12T00:00:00Z'),
      s('d', '2026-10-10T00:00:00Z'),
      s('e', '2026-09-29T00:00:00Z'),
      s('f', '2026-09-25T00:00:00Z'),
      s('g', '2026-09-27T00:00:00Z'),
    ];
    const out = sortSignalsByEventDate(input).map((x) => x.id);
    expect(out).toEqual(['a', 'b', 'c', 'd', 'e', 'g', 'f']);
  });

  it('is monotonic non-increasing by published_at', () => {
    const input = [
      s('x', '2026-09-25T00:00:00Z'),
      s('y', '2026-11-06T00:00:00Z'),
      s('z', '2026-10-01T00:00:00Z'),
      s('w', '2026-09-27T00:00:00Z'),
    ];
    const times = sortSignalsByEventDate(input).map((x) =>
      new Date(x.published_at as string).getTime(),
    );
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
    }
  });

  it('sinks signals with a missing published_at to the bottom', () => {
    const input = [s('null', null), s('old', '2026-01-01T00:00:00Z'), s('new', '2026-11-06T00:00:00Z')];
    expect(sortSignalsByEventDate(input).map((x) => x.id)).toEqual(['new', 'old', 'null']);
  });

  it('treats an unparseable date like a missing date', () => {
    const input = [s('bad', 'not-a-date'), s('good', '2026-11-06T00:00:00Z')];
    expect(sortSignalsByEventDate(input).map((x) => x.id)).toEqual(['good', 'bad']);
  });

  it('breaks equal event-date ties by higher relevance score', () => {
    const input = [
      s('low', '2026-11-06T00:00:00Z', '2026-11-06T00:00:00Z', 0.4),
      s('high', '2026-11-06T00:00:00Z', '2026-11-06T00:00:00Z', 0.9),
    ];
    expect(sortSignalsByEventDate(input).map((x) => x.id)).toEqual(['high', 'low']);
  });

  it('breaks equal date+score ties by newer created_at', () => {
    const input = [
      s('old', '2026-11-06T00:00:00Z', '2026-11-06T00:00:00Z', 0.8),
      s('newer', '2026-11-06T00:00:00Z', '2026-11-07T00:00:00Z', 0.8),
    ];
    expect(sortSignalsByEventDate(input).map((x) => x.id)).toEqual(['newer', 'old']);
  });

  it('does not mutate the input array', () => {
    const input = [s('a', '2026-01-01T00:00:00Z'), s('b', '2026-11-06T00:00:00Z')];
    const snapshot = input.map((x) => x.id);
    sortSignalsByEventDate(input);
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });
});
