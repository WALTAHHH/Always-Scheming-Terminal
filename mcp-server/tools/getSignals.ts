import { astFetch, toText } from './helpers.js';
export async function getSignals(a: Record<string, unknown>) {
  const p = new URLSearchParams();
  if (a.limit)       p.set('limit',       String(a.limit));
  if (a.min_score)   p.set('min_score',   String(a.min_score));
  if (a.signal_type) p.set('signal_type', String(a.signal_type));
  return toText(await astFetch(`/api/v1/signals?${p}`));
}
