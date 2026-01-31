import type { FeedItem } from "./database.types";

// ── Stop words to ignore in similarity matching ────────────────────
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need", "must",
  "it", "its", "this", "that", "these", "those", "i", "we", "you", "he",
  "she", "they", "me", "him", "her", "us", "them", "my", "your", "his",
  "our", "their", "what", "which", "who", "whom", "how", "when", "where",
  "why", "if", "then", "than", "so", "no", "not", "only", "very", "just",
  "about", "up", "out", "into", "over", "after", "before", "between",
  "under", "again", "more", "most", "some", "such", "also", "back",
  "new", "now", "here", "there", "all", "any", "both", "each", "few",
  "many", "much", "own", "other", "as", "says", "said", "according",
  "report", "reports", "news", "via", "per", "amid", "despite",
]);

// ── Company name normalization ─────────────────────────────────────
const COMPANY_ALIASES: Record<string, string> = {
  "ea": "electronic arts",
  "electronic": "electronic arts",
  "arts": "electronic arts",
  "ms": "microsoft",
  "msft": "microsoft",
  "activision": "activision blizzard",
  "blizzard": "activision blizzard",
  "riot": "riot games",
  "epic": "epic games",
  "cd": "cd projekt",
  "projekt": "cd projekt",
  "cdpr": "cd projekt",
  "meta": "meta platforms",
  "facebook": "meta platforms",
  "timi": "timi studio",
  "netease": "netease games",
  "square": "square enix",
  "enix": "square enix",
  "bio": "bioware",
  "bioware": "bioware",
  "ubi": "ubisoft",
};

/**
 * Extract significant words from a title for comparison.
 * Normalizes company names, removes stop words, lowercases.
 */
function extractWords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s$%]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  const normalized = new Set<string>();
  for (const w of words) {
    const alias = COMPANY_ALIASES[w];
    if (alias) {
      normalized.add(alias);
    } else {
      normalized.add(w);
    }
  }

  return normalized;
}

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Cluster types ──────────────────────────────────────────────────

export interface StoryCluster {
  id: string;
  lead: FeedItem;
  related: FeedItem[];
  sourceCount: number;
  sourceNames: string[];
  isMultiSource: boolean;
}

/**
 * Cluster items by title similarity within a time window.
 *
 * Rules:
 * - Only cluster items within 72 hours of each other
 * - Same source doesn't count as corroboration (tracked separately)
 * - Similarity threshold: 0.25 (tuned for news headlines)
 * - Max cluster size: 10
 */
export function clusterItems(
  items: FeedItem[],
  threshold = 0.3
): StoryCluster[] {
  const MAX_CLUSTER_SIZE = 10;
  const TIME_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours

  // Pre-compute word sets for all items
  const wordSets = items.map((item) => extractWords(item.title));

  // Track which items have been assigned to a cluster
  const assigned = new Set<number>();
  const clusters: StoryCluster[] = [];

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;

    const cluster: number[] = [i];
    assigned.add(i);

    const itemDate = items[i].published_at
      ? new Date(items[i].published_at!).getTime()
      : 0;

    // Find similar items
    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      if (cluster.length >= MAX_CLUSTER_SIZE) break;

      // Time window check
      const otherDate = items[j].published_at
        ? new Date(items[j].published_at!).getTime()
        : 0;
      if (Math.abs(itemDate - otherDate) > TIME_WINDOW_MS) continue;

      // Similarity check
      const sim = jaccard(wordSets[i], wordSets[j]);
      if (sim >= threshold) {
        cluster.push(j);
        assigned.add(j);
      }
    }

    // Build the cluster object
    const clusterItems = cluster.map((idx) => items[idx]);
    const uniqueSources = [
      ...new Set(clusterItems.map((item) => item.sources?.name).filter(Boolean)),
    ] as string[];

    // Lead = first item (most recent since items are sorted by date desc)
    const lead = clusterItems[0];
    const related = clusterItems.slice(1);

    clusters.push({
      id: lead.id,
      lead,
      related,
      sourceCount: uniqueSources.length,
      sourceNames: uniqueSources,
      isMultiSource: uniqueSources.length > 1,
    });
  }

  return clusters;
}
