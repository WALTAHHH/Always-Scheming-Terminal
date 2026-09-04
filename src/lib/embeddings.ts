/**
 * Generate embeddings using Gemini text-embedding-004 model.
 * Requires GOOGLE_AI_API_KEY environment variable.
 */

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn('[embeddings] GOOGLE_AI_API_KEY not set, skipping embedding');
    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            parts: [{ text }],
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[embeddings] Gemini API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const embedding = data.embedding?.values;
    if (!embedding || !Array.isArray(embedding)) {
      console.warn('[embeddings] Invalid embedding response shape');
      return [];
    }

    // text-embedding-004 returns 768 dimensions
    if (embedding.length !== 768) {
      console.warn(`[embeddings] Unexpected embedding length: ${embedding.length}`);
    }

    return embedding;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.warn('[embeddings] Embedding call timed out after 6s');
    } else {
      console.warn('[embeddings] Embedding call failed:', err);
    }
    return [];
  }
}