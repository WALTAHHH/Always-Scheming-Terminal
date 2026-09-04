
const BASE_URL = process.env.AST_BASE_URL || 'https://terminal.always-scheming.com';
const API_KEY = process.env.AST_API_KEY || '';

export async function astFetch(path: string, options?: RequestInit): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`AST API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function toText(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
