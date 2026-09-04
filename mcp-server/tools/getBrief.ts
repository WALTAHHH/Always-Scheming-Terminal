import { astFetch, toText } from './helpers.js';
export async function getBrief(a: Record<string, unknown>) {
  if (!a.query) throw new Error('query is required');
  return toText(await astFetch('/api/v1/brief', {
    method: 'POST',
    body: JSON.stringify({ query: a.query, limit: a.limit ?? 5, date_from: a.date_from, entity: a.entity }),
  }));
}
