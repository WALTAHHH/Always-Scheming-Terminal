import { astFetch, toText } from './helpers.js';
export async function getItems(a: Record<string, unknown>) {
  const p = new URLSearchParams();
  if (a.limit)          p.set('limit',          String(a.limit));
  if (a.date_from)      p.set('date_from',      String(a.date_from));
  if (a.date_to)        p.set('date_to',        String(a.date_to));
  if (a.min_importance) p.set('min_importance', String(a.min_importance));
  return toText(await astFetch(`/api/v1/items?${p}`));
}
