/**
 * Hybrid tagging system
 * - Category: rule-based (derived from source type + keyword detection)
 * - Platform: rule-based (keyword matching with word boundaries)
 * - Theme: rule-based (keyword matching with word boundaries)
 * - Company: AI (OpenAI gpt-4o-mini) — activates when OPENAI_API_KEY set
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

// ── Rule-based: Category from source type ──────────────────────────
const SOURCE_TYPE_TO_CATEGORY: Record<string, string> = {
  newsletter: "analysis",
  news: "article",
  analysis: "analysis",
  podcast: "podcast",
};

// ── Content category keywords (supplements source-based) ───────────
const CATEGORY_RULES: Record<string, string[]> = {
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
  podcast: [
    "podcast", "episode",
  ],
  opinion: [
    "opinion", "editorial", "| opinion",
  ],
};

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

  // Category: start with source type, then check for specific content categories
  const categories = new Set<string>();
  const baseCategory = SOURCE_TYPE_TO_CATEGORY[sourceType] || "article";
  categories.add(baseCategory);

  for (const [cat, keywords] of Object.entries(CATEGORY_RULES)) {
    if (matchesAny(text, keywords)) {
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

  return {
    category: [...categories],
    platform: [...platforms],
    theme: [...themes],
    company: [], // AI fills this in
  };
}

/**
 * AI-based tagging for companies and themes.
 * Returns additional tags to merge with rule-based results.
 * Requires OPENAI_API_KEY in env.
 */
export async function tagItemWithAI(
  title: string,
  content: string | null
): Promise<{ company: string[]; theme: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { company: [], theme: [] };
  }

  const excerpt = content ? content.slice(0, 500) : "";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: `Extract gaming industry tags from this article. Return JSON only, no markdown.
Format: {"companies":["Company Name"],"themes":["theme-slug"]}
Valid themes: ai, ugc, live-services, cloud-gaming, vr-ar, blockchain, esports, indie, mobile-first, free-to-play, premium, subscription
Only include what's clearly mentioned. Empty arrays if none found.`,
          },
          {
            role: "user",
            content: `Title: ${title}\nContent: ${excerpt}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI API error: ${response.status}`);
      return { company: [], theme: [] };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "{}";

    // Parse JSON, handling potential markdown wrapping
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      company: Array.isArray(parsed.companies) ? parsed.companies : [],
      theme: Array.isArray(parsed.themes) ? parsed.themes : [],
    };
  } catch (err) {
    console.error("AI tagging failed:", err);
    return { company: [], theme: [] };
  }
}
