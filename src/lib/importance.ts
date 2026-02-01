/**
 * Rule-based importance scoring for AST items and clusters.
 *
 * Produces a 0–1 score based on:
 *   - Content category (earnings, M&A, fundraising score highest)
 *   - Source authority (analysis > newsletter > news)
 *   - Company density (more companies = bigger industry event)
 *   - Financial signals in title ($, %, revenue, billion, etc.)
 *   - Tag richness (articles tagged across multiple dimensions)
 *
 * Cluster-level bonuses:
 *   - Multi-source corroboration
 *   - Related article count
 */

import type { FeedItem } from "./database.types";
import type { StoryCluster } from "./cluster";

// ── Category weights (max 0.30) ───────────────────────────────────

const CATEGORY_WEIGHTS: Record<string, number> = {
  earnings: 0.30,
  "m-and-a": 0.30,
  fundraising: 0.25,
  analysis: 0.08,
  opinion: 0.04,
  podcast: 0.04,
};

// ── Source type authority (max 0.15) ───────────────────────────────

const SOURCE_TYPE_WEIGHTS: Record<string, number> = {
  analysis: 0.15,
  newsletter: 0.12,
  news: 0.10,
  podcast: 0.08,
};

// ── Financial signal patterns ──────────────────────────────────────

const FINANCIAL_PATTERNS = [
  /\$\d/i,                              // Dollar amounts
  /\d+%/,                               // Percentages
  /\b(billion|million|revenue|profit|loss|quarterly|ipo)\b/i,
  /\b(acquir|merger|layoff|shut.?down|clos(e[ds]?|ing))\b/i,
  /\b(series [a-f]|seed round|funding)\b/i,
];

// ── Scoring functions ──────────────────────────────────────────────

/**
 * Score a single item. Returns 0–1 (unclamped sum of signals).
 */
export function scoreItem(item: FeedItem): number {
  let score = 0;
  const tags = (item.tags as Record<string, string[]>) || {};

  // 1. Category weight (take highest if multiple)
  const categories = tags.category || [];
  let maxCatWeight = 0;
  for (const cat of categories) {
    const w = CATEGORY_WEIGHTS[cat] ?? 0;
    if (w > maxCatWeight) maxCatWeight = w;
  }
  score += maxCatWeight;

  // 2. Source authority
  const sourceType = item.sources?.source_type || "news";
  score += SOURCE_TYPE_WEIGHTS[sourceType] ?? 0.08;

  // 3. Company density
  const companies = tags.company || [];
  if (companies.length >= 3) {
    score += 0.15;
  } else if (companies.length === 2) {
    score += 0.10;
  } else if (companies.length === 1) {
    score += 0.05;
  }

  // 4. Financial signals in title
  const title = item.title || "";
  let financialHits = 0;
  for (const pattern of FINANCIAL_PATTERNS) {
    if (pattern.test(title)) financialHits++;
  }
  score += Math.min(financialHits * 0.05, 0.15);

  // 5. Tag richness — how many dimensions have values
  const populatedDimensions = Object.entries(tags).filter(
    ([, v]) => Array.isArray(v) && v.length > 0
  ).length;
  score += Math.min(populatedDimensions * 0.02, 0.08);

  return Math.min(score, 1);
}

/**
 * Score a cluster. Starts with the lead item score,
 * then adds bonuses for multi-source corroboration and cluster size.
 */
export function scoreCluster(cluster: StoryCluster): number {
  // Lead item score
  let score = scoreItem(cluster.lead);

  // Also check if any related item scores higher (pick max)
  for (const item of cluster.related) {
    const itemScore = scoreItem(item);
    if (itemScore > score) score = itemScore;
  }

  // Multi-source bonus
  if (cluster.isMultiSource) {
    score += 0.15;
    // Extra per source beyond 2
    const extraSources = Math.max(0, cluster.sourceCount - 2);
    score += extraSources * 0.05;
  }

  // Cluster size bonus (capped)
  const relatedBonus = Math.min(cluster.related.length * 0.02, 0.10);
  score += relatedBonus;

  return Math.min(score, 1);
}

// ── Importance tier for visual display ─────────────────────────────

export type ImportanceTier = "critical" | "high" | "medium" | "low";

export function getImportanceTier(score: number): ImportanceTier {
  if (score >= 0.65) return "critical";
  if (score >= 0.45) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

export const TIER_STYLES: Record<ImportanceTier, { label: string; color: string; bgColor: string; dotColor: string; tooltip: string }> = {
  critical: { label: "HOT",  color: "text-ast-pink",   bgColor: "bg-ast-pink/10",   dotColor: "bg-ast-pink",   tooltip: "Critical — Major industry event (M&A, earnings, fundraising with high corroboration)" },
  high:     { label: "HIGH", color: "text-ast-gold",   bgColor: "bg-ast-gold/10",   dotColor: "bg-ast-gold",   tooltip: "High Signal — Notable story with strong indicators" },
  medium:   { label: "",     color: "text-ast-accent",  bgColor: "bg-ast-accent/10", dotColor: "bg-ast-accent", tooltip: "Medium Signal — Moderately notable" },
  low:      { label: "",     color: "text-ast-muted",   bgColor: "",                  dotColor: "",              tooltip: "" },
};
