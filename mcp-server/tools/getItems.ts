
import { astFetch, toText } from './helpers.js';

export async function getItems(args: Record<string, unknown>) {
  const params = new URLSearchParams();
  if (args.limit)          params.set('limit',          String(args.limit));
  if (args.date_from)      params.set('date_from',      String(args.date_from));
  if (args.date_to)        params.set('date_to',        String(args.date_to));
  if (args.min_importance) params.set('min_importance', String(args.min_importance));
  const data = await astFetch(`/api/v1/items?${params}`);
  return toText(data);
}
