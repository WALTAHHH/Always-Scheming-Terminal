/**
 * Hybrid tagging system
 * - Category: rule-based (derived from source type + keyword detection)
 * - Platform: rule-based (keyword matching with word boundaries)
 * - Theme: rule-based (keyword matching with word boundaries)
 * - Company: rule-based (name/alias matching) + AI fallback (OpenAI gpt-4o-mini)
 */

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Check if ANY keyword matches in the text using word boundaries.
 * This prevents "ar" matching inside "year" or "vr" inside "every".
 */
function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    return re.test(text);
  });
}

/**
 * Count how many keywords match in the text using word boundaries.
 * Used for categories that require multiple signals to reduce false positives.
 */
function countMatches(text: string, keywords: string[]): number {
  return keywords.filter((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    return re.test(text);
  }).length;
}

// ── Rule-based: Platform keywords ──────────────────────────────────
const PLATFORM_RULES: Record<string, string[]> = {
  mobile: [
    "mobile", "mobile game", "mobile gaming", "ios", "android",
    "iphone", "ipad", "app store", "google play", "smartphone",
    "mobile-first",
  ],
  console: [
    "console", "playstation", "ps5", "ps4", "ps3",
    "xbox", "xbox series", "nintendo", "switch", "switch 2",
    "game boy", "handheld",
  ],
  pc: [
    "pc gaming", "pc game", "steam", "epic games store",
    "gog", "windows gaming", "pc and console",
    // standalone "pc" is tricky — use word boundary but it's only 2 chars
    // we rely on the regex word boundary to handle this
    "pc",
  ],
  vr: [
    "virtual reality", "meta quest", "quest 2", "quest 3",
    "quest pro", "psvr", "vision pro", "mixed reality headset",
    // standalone "VR" — word boundary protects against "every", "over" etc.
    "vr",
  ],
  web: [
    "browser game", "browser-based", "html5", "webgl",
    "web game", "web gaming",
  ],
};

// ── Rule-based: Theme keywords ─────────────────────────────────────
const THEME_RULES: Record<string, string[]> = {
  ai: [
    "artificial intelligence", "machine learning", "generative ai",
    "llm", "chatgpt", "copilot", "ai-powered", "ai-first",
    "ai agent", "ai tool", "ai model",
    // standalone "AI" — word boundary handles it (won't match "said", "fair")
    "ai",
  ],
  ugc: [
    "ugc", "user-generated content", "user generated content",
    "roblox", "fortnite creative", "modding community",
    "mod support", "creator economy", "user-generated",
  ],
  "live-services": [
    "live service", "live-service", "live services", "live ops",
    "games as a service", "gaas", "battle pass", "season pass",
    "live game", "recurring revenue",
  ],
  "cloud-gaming": [
    "cloud gaming", "game streaming", "geforce now",
    "xbox cloud gaming", "luna", "cloud-based gaming",
  ],
  "vr-ar": [
    "virtual reality", "augmented reality", "mixed reality",
    "metaverse", "spatial computing", "xr",
    // Only match standalone VR/AR with word boundaries
    "vr", "ar",
  ],
  blockchain: [
    "blockchain", "nft", "web3", "crypto gaming",
    "play-to-earn", "play to earn", "p2e", "token",
    "on-chain",
  ],
  esports: [
    "esports", "e-sports", "esport", "competitive gaming",
    "tournament", "pro league", "competitive scene",
  ],
  indie: [
    "indie game", "indie developer", "indie studio",
    "independent developer", "solo dev", "small studio",
    "indie hit", "indie dev",
  ],
};

// ── Rule-based: Theme keywords ─────────────────────────────────────
const SOURCE_TYPE_TO_CATEGORY: Record<string, string> = {
  newsletter: "analysis",
  news: "article",
  analysis: "analysis",
  podcast: "podcast",
};

// ── Content category keywords (supplements source-based) ───────────
// These check BOTH title and content
const CATEGORY_RULES_FULL: Record<string, string[]> = {
  earnings: [
    "earnings", "revenue report", "quarterly results", "quarterly report",
    "fiscal year", "financial results", "operating profit",
    "operating income", "operating loss", "net income",
    "year-on-year", "year-over-year", "yoy",
  ],
  "m-and-a": [
    "acquisition", "acquired", "acquires", "merger",
    "buyout", "takeover", "purchase agreement",
  ],
  fundraising: [
    "funding round", "fundraising", "series a", "series b",
    "series c", "series d", "seed round", "seed funding",
    "investment round", "venture capital",
    "raised \\$", "raises \\$", "secures \\$",
  ],
  layoffs: [
    "layoffs", "laid off", "laying off", "job cuts", "job losses",
    "workforce reduction", "downsizing", "restructuring",
    "lets go", "let go of", "cutting jobs", "cutting staff",
    "studio closure", "studio closures", "shutting down",
  ],
  release: [
    "launches", "now available", "out now", "release date",
    "coming to", "arrives on", "releasing", "announced for",
    "launches on", "hits stores", "available now",
  ],
  interview: [
    "interview", "speaks to", "talks to", "sits down with",
    "in conversation", "q&a", "talks about", "discusses",
  ],
};

// These check TITLE ONLY (too noisy in body text — cross-promos, etc.)
const CATEGORY_RULES_TITLE_ONLY: Record<string, string[]> = {
  podcast: [
    "podcast", "on the pod",
  ],
  opinion: [
    "opinion", "editorial", "| opinion",
  ],
};

// ── Negative patterns for earnings (exclude analysis/opinion pieces) ──
const EARNINGS_NEGATIVE_PATTERNS: string[] = [
  // Analysis/opinion indicators
  "analysis", "opinion", "editorial", "commentary", "perspective",
  "what it means", "what this means", "implications",
  "my take", "our take", "deep dive", "breakdown",
  // Future predictions (not actual earnings)
  "will dominate", "could dominate", "may dominate",
  "predictions", "forecast", "outlook", "trends to watch",
  // General industry pieces
  "state of the industry", "industry trends", "market overview",
];

// All possible categories (for UI to show even when count is 0)
export const ALL_CATEGORIES = [
  "earnings",
  "m-and-a",
  "fundraising",
  "layoffs",
  "release",
  "interview",
  "podcast",
  "opinion",
];

// All possible platforms (for UI to show even when count is 0)
export const ALL_PLATFORMS = Object.keys(PLATFORM_RULES);

// All possible themes (for UI to show even when count is 0)
export const ALL_THEMES = Object.keys(THEME_RULES);

export interface TagResult {
  category: string[];
  platform: string[];
  theme: string[];
  company: string[];
}

/**
 * Extract tags from an item using rule-based matching with word boundaries.
 */
export function tagItem(
  title: string,
  content: string | null,
  sourceType: string
): TagResult {
  const text = `${title} ${content || ""}`;

  // Category: only tag specific content types (not generic "analysis"/"article")
  const categories = new Set<string>();

  // Full text matching (title + content) for specific categories
  for (const [cat, keywords] of Object.entries(CATEGORY_RULES_FULL)) {
    if (cat === "earnings") {
      // Earnings requires 2+ keyword matches to reduce false positives
      const matchCount = countMatches(text, keywords);
      if (matchCount >= 2) {
        // Also check negative patterns — exclude analysis/opinion pieces
        if (!matchesAny(text, EARNINGS_NEGATIVE_PATTERNS)) {
          categories.add(cat);
        }
      }
    } else if (matchesAny(text, keywords)) {
      categories.add(cat);
    }
  }

  // Title-only matching for categories prone to false positives in body text
  for (const [cat, keywords] of Object.entries(CATEGORY_RULES_TITLE_ONLY)) {
    if (matchesAny(title, keywords)) {
      categories.add(cat);
    }
  }

  // Platform: keyword matching with word boundaries
  const platforms = new Set<string>();
  for (const [platform, keywords] of Object.entries(PLATFORM_RULES)) {
    if (matchesAny(text, keywords)) {
      platforms.add(platform);
    }
  }

  // Theme: keyword matching with word boundaries
  const themes = new Set<string>();
  for (const [theme, keywords] of Object.entries(THEME_RULES)) {
    if (matchesAny(text, keywords)) {
      themes.add(theme);
    }
  }

  // Company: no longer tagged here; entity resolution now happens in ingest.ts
  // after items are inserted, via entity-resolver.ts

  return {
    category: [...categories],
    platform: [...platforms],
    theme: [...themes],
    company: [], // Empty - entity resolution now happens async in ingest pipeline
  };
}


const AI_TIMEOUT_MS = 4000;

/**
 * Wraps a promise with a hard timeout. Resolves with fallback value if exceeded.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * AI-based tagging using Google Gemini Flash.
 * Augments rule-based tags with companies/themes the rules miss.
 * Falls back to empty arrays on any failure or timeout.
 * Requires GOOGLE_AI_API_KEY in env.
 */
export async function tagItemWithAI(
  title: string,
  content: string | null
): Promise<{ company: string[]; theme: string[] }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return { company: [], theme: [] };
  }

  const excerpt = content ? content.slice(0, 500) : "";

  const prompt = `Extract gaming industry tags from this article. Return JSON only, no markdown.
Format: {"companies":["Company Name"],"themes":["theme-slug"]}
Valid themes: ai, ugc, live-services, cloud-gaming, vr-ar, blockchain, esports, indie, mobile-first, free-to-play, premium, subscription
Only include what's clearly mentioned. Empty arrays if none found.

Title: ${title}
Content: ${excerpt}`;

  const call = async (): Promise<{ company: string[]; theme: string[] }> => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 200 },
        }),
      }
    );

    if (!response.ok) {
      console.error(`Gemini API error: ${response.status}`);
      return { company: [], theme: [] };
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      company: Array.isArray(parsed.companies) ? parsed.companies : [],
      theme: Array.isArray(parsed.themes) ? parsed.themes : [],
    };
  };

  try {
    return await withTimeout(call(), AI_TIMEOUT_MS, { company: [], theme: [] });
  } catch (err) {
    console.error("AI tagging failed:", err);
    return { company: [], theme: [] };
  }
}

/**
 * Generate an AI takeaway using Google Gemini Flash.
 * Returns a one-sentence investment signal (max 20 words) or null.
 * Falls back to null on any failure or timeout.
 * Requires GOOGLE_AI_API_KEY in env.
 */
export async function generateTakeaway(
  title: string,
  content: string | null
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const excerpt = content ? content.slice(0, 300) : "";

  const prompt = `In one sentence (max 20 words), what is the investment-relevant signal in this article? If there is no investment signal, respond with null. Article: ${title}. ${excerpt}`;

  const call = async (): Promise<string | null> => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 100 },
        }),
      }
    );

    if (!response.ok) {
      console.error(`Gemini API error (takeaway): ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = text.trim();

    // If response is literally "null" or empty, return null
    if (!cleaned || cleaned.toLowerCase() === "null") {
      return null;
    }

    return cleaned;
  };

  try {
    return await withTimeout(call(), AI_TIMEOUT_MS, null);
  } catch (err) {
    console.error("Takeaway generation failed:", err);
    return null;
  }
}
