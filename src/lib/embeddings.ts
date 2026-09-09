/**
 * Gemini text-embedding-004 (768 dimensions).
 * Fire-and-forget safe — returns [] on any failure.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn('[embeddings] GOOGLE_AI_API_KEY not set');
    return [];
  }
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 1536 }),
        signal: controller.signal,
      }
    );
    clearTimeout(tid);
    if (!res.ok) {
      console.warn(`[embeddings] API error ${res.status}`);
      return [];
    }
    const data = await res.json();
    return data.embedding?.values ?? [];
  } catch (err) {
    console.warn('[embeddings] failed:', err);
    return [];
  }
}
