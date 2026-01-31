/**
 * Hybrid tagging system
 * - Category: rule-based (derived from source type)
 * - Platform: rule-based (keyword matching)
 * - Company + Theme: AI (OpenAI gpt-4o-mini) — stubbed until key is provided
 */

// ── Rule-based: Platform keywords ──────────────────────────────────
const PLATFORM_KEYWORDS: Record<string, string[]> = {
  mobile: ["mobile", "ios", "android", "iphone", "ipad", "app store", "google play", "smartphone"],
  console: ["console", "playstation", "ps5", "ps4", "xbox", "nintendo", "switch", "switch 2"],
  pc: ["pc", "steam", "epic games store", "gog", "desktop", "windows"],
  vr: ["vr", "virtual reality", "quest", "meta quest", "psvr", "vision pro", "mixed reality", "xr"],
  web: ["web", "browser", "html5", "webgl"],
};

// ── Rule-based: Theme keywords ─────────────────────────────────────
const THEME_KEYWORDS: Record<string, string[]> = {
  ai: ["artificial intelligence", " ai ", "machine learning", "generative ai", "llm", "chatgpt", "copilot"],
  ugc: ["ugc", "user-generated", "user generated", "roblox", "fortnite creative", "modding", "mod support"],
  "live-services": ["live service", "live-service", "gaas", "games as a service", "battle pass", "season pass", "live ops"],
  "cloud-gaming": ["cloud gaming", "game streaming", "geforce now", "xbox cloud", "luna"],
  "vr-ar": ["vr", "ar", "virtual reality", "augmented reality", "mixed reality", "metaverse", "spatial computing"],
  blockchain: ["blockchain", "nft", "web3", "crypto", "play-to-earn", "p2e", "token"],
  esports: ["esports", "e-sports", "competitive gaming", "tournament", "league"],
  indie: ["indie", "independent developer", "solo dev", "small studio"],
};

// ── Rule-based: Category from source type ──────────────────────────
const SOURCE_TYPE_TO_CATEGORY: Record<string, string> = {
  newsletter: "analysis",
  news: "article",
  analysis: "analysis",
  podcast: "podcast",
};

// ── Content category keywords (supplements source-based) ───────────
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  earnings: ["earnings", "revenue", "quarterly", "q1", "q2", "q3", "q4", "fiscal", "financial results", "profit", "operating income"],
  "m-and-a": ["acquisition", "acquired", "merger", "buyout", "takeover", "purchase"],
  fundraising: ["funding", "fundrais", "series a", "series b", "series c", "seed round", "investment round", "raised", "venture capital", "led by"],
  podcast: ["podcast", "episode", "listen"],
  opinion: ["opinion", "editorial", "take", "hot take", "perspective"],
};

export interface TagResult {
  category: string[];
  platform: string[];
  theme: string[];
  company: string[];
}

/**
 * Extract tags from an item using rule-based matching.
 * Company extraction is minimal (rule-based only) — AI handles the heavy lifting.
 */
export function tagItem(
  title: string,
  content: string | null,
  sourceType: string
): TagResult {
  const text = `${title} ${content || ""}`.toLowerCase();

  // Category: start with source type, then check for specific content categories
  const categories = new Set<string>();
  const baseCategory = SOURCE_TYPE_TO_CATEGORY[sourceType] || "article";
  categories.add(baseCategory);

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      categories.add(cat);
    }
  }

  // Platform: keyword matching
  const platforms = new Set<string>();
  for (const [platform, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      platforms.add(platform);
    }
  }

  // Theme: keyword matching (supplements AI later)
  const themes = new Set<string>();
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
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
