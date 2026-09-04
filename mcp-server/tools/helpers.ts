const BASE = process.env.AST_BASE_URL || 'https://terminal.always-scheming.com';
const KEY  = process.env.AST_API_KEY  || '';

export async function astFetch(path: string, opts?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`AST ${res.status}: ${await res.text()}`);
  return res.json();
}

export const toText = (d: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(d, null, 2) }] });
