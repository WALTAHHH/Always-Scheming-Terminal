import { astFetch, toText } from './helpers.js';
export async function getEntities(a: Record<string, unknown>) {
  const p = new URLSearchParams();
  if (a.limit)       p.set('limit',       String(a.limit));
  if (a.entity_type) p.set('entity_type', String(a.entity_type));
  return toText(await astFetch(`/api/v1/entities?${p}`));
}
