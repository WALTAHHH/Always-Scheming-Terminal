
import { astFetch, toText } from './helpers.js';

export async function getEntities(args: Record<string, unknown>) {
  const params = new URLSearchParams();
  if (args.limit)       params.set('limit',       String(args.limit));
  if (args.entity_type) params.set('entity_type', String(args.entity_type));
  const data = await astFetch(`/api/v1/entities?${params}`);
  return toText(data);
}
