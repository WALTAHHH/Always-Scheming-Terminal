
import { astFetch, toText } from './helpers.js';

export async function getBrief(args: Record<string, unknown>) {
  if (!args.query) throw new Error('query is required');
  const data = await astFetch('/api/v1/brief', {
    method: 'POST',
    body: JSON.stringify({
      query:     args.query,
      limit:     args.limit     ?? 5,
      date_from: args.date_from ?? undefined,
      entity:    args.entity    ?? undefined,
    }),
  });
  return toText(data);
}
