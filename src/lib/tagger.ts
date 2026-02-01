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

// ── Rule-based: Company matching ────────────────────────────────────

interface CompanyDef {
  /** Canonical display name */
  name: string;
  /** All matchable names/aliases (lowercase matching via word boundary) */
  aliases: string[];
  /** Segment for grouping */
  segment: string;
  /** If tagging this company, also tag these parent companies */
  alsoTag?: string[];
}

const COMPANY_LIST: CompanyDef[] = [
  // ── Platform Holders & Big Tech ──
  { name: "Microsoft Gaming", segment: "platform", aliases: ["microsoft gaming", "xbox", "xbox game studios"] },
  { name: "Sony Interactive", segment: "platform", aliases: ["sony interactive", "playstation", "sie", "sony gaming"] },
  { name: "Nintendo", segment: "platform", aliases: ["nintendo", "switch 2"] },
  { name: "Apple", segment: "platform", aliases: ["apple arcade", "app store"] },
  { name: "Google", segment: "platform", aliases: ["google play", "youtube gaming"] },
  { name: "Valve", segment: "platform", aliases: ["valve", "steam"] },
  { name: "Epic Games", segment: "platform", aliases: ["epic games", "unreal engine", "epic games store", "fortnite"] },
  { name: "Roblox", segment: "platform", aliases: ["roblox"] },
  { name: "Meta", segment: "platform", aliases: ["meta quest", "reality labs", "horizon worlds", "quest 3", "quest pro"] },

  // ── Major Western Publishers ──
  { name: "Electronic Arts", segment: "western-pub", aliases: ["electronic arts", "ea sports", "ea fc", "apex legends"] },
  { name: "Take-Two Interactive", segment: "western-pub", aliases: ["take-two", "take two", "rockstar games", "2k games", "2k sports", "zynga"] },
  { name: "Ubisoft", segment: "western-pub", aliases: ["ubisoft"] },
  { name: "Embracer Group", segment: "western-pub", aliases: ["embracer", "thq nordic", "gearbox", "crystal dynamics"] },
  { name: "CD Projekt", segment: "western-pub", aliases: ["cd projekt", "cdpr", "gog.com"] },
  { name: "Devolver Digital", segment: "western-pub", aliases: ["devolver digital", "devolver"] },

  // ── Major Asian Publishers ──
  { name: "Tencent", segment: "asian-pub", aliases: ["tencent", "tencent games", "tencent holdings"] },
  { name: "NetEase", segment: "asian-pub", aliases: ["netease"] },
  { name: "Nexon", segment: "asian-pub", aliases: ["nexon", "maplestory", "dungeon fighter"] },
  { name: "Krafton", segment: "asian-pub", aliases: ["krafton", "pubg"] },
  { name: "Bandai Namco", segment: "asian-pub", aliases: ["bandai namco", "bandai"] },
  { name: "Capcom", segment: "asian-pub", aliases: ["capcom"] },
  { name: "Square Enix", segment: "asian-pub", aliases: ["square enix"] },
  { name: "Sega", segment: "asian-pub", aliases: ["sega"] },
  { name: "Konami", segment: "asian-pub", aliases: ["konami"] },
  { name: "miHoYo", segment: "asian-pub", aliases: ["mihoyo", "hoyoverse", "genshin impact", "honkai star rail"] },
  { name: "Netmarble", segment: "asian-pub", aliases: ["netmarble"] },
  { name: "Pearl Abyss", segment: "asian-pub", aliases: ["pearl abyss", "black desert", "crimson desert"] },
  { name: "Shift Up", segment: "asian-pub", aliases: ["shift up", "stellar blade", "nikke"] },
  { name: "NCSoft", segment: "asian-pub", aliases: ["ncsoft", "throne and liberty"] },
  { name: "Com2uS", segment: "asian-pub", aliases: ["com2us", "summoners war"] },
  { name: "Sea Limited", segment: "asian-pub", aliases: ["sea limited", "garena", "free fire"] },
  { name: "Lilith Games", segment: "asian-pub", aliases: ["lilith games", "lilith"] },
  { name: "ByteDance", segment: "asian-pub", aliases: ["bytedance", "nuverse"] },
  { name: "Kakao Games", segment: "asian-pub", aliases: ["kakao games", "kakao"] },

  // ── Mobile-First / F2P ──
  { name: "Supercell", segment: "mobile", aliases: ["supercell", "clash of clans", "brawl stars"], alsoTag: ["Tencent"] },
  { name: "Playtika", segment: "mobile", aliases: ["playtika"] },
  { name: "AppLovin", segment: "mobile", aliases: ["applovin"] },
  { name: "Scopely", segment: "mobile", aliases: ["scopely", "monopoly go"], alsoTag: ["Savvy Games Group"] },
  { name: "Moon Active", segment: "mobile", aliases: ["moon active", "coin master"] },
  { name: "Dream Games", segment: "mobile", aliases: ["dream games", "royal match"] },
  { name: "Habby", segment: "mobile", aliases: ["habby", "archero", "survivor.io"] },
  { name: "Jam City", segment: "mobile", aliases: ["jam city"] },
  { name: "Rovio", segment: "mobile", aliases: ["rovio", "angry birds"], alsoTag: ["Sega"] },
  { name: "Niantic", segment: "mobile", aliases: ["niantic", "pokemon go", "pokémon go"] },
  { name: "Miniclip", segment: "mobile", aliases: ["miniclip"], alsoTag: ["Tencent"] },
  { name: "Voodoo", segment: "mobile", aliases: ["voodoo"] },
  { name: "Tripledot Studios", segment: "mobile", aliases: ["tripledot"] },

  // ── PC/Console Studios ──
  { name: "Activision Blizzard", segment: "studio", aliases: ["activision blizzard", "activision", "blizzard", "call of duty", "world of warcraft", "diablo", "king digital", "candy crush"], alsoTag: ["Microsoft Gaming"] },
  { name: "Bethesda", segment: "studio", aliases: ["bethesda", "zenimax", "starfield", "elder scrolls", "fallout"], alsoTag: ["Microsoft Gaming"] },
  { name: "Bungie", segment: "studio", aliases: ["bungie", "destiny 2", "marathon"], alsoTag: ["Sony Interactive"] },
  { name: "Riot Games", segment: "studio", aliases: ["riot games", "riot", "league of legends", "valorant"], alsoTag: ["Tencent"] },
  { name: "Larian Studios", segment: "studio", aliases: ["larian", "baldur's gate 3", "baldurs gate"] },
  { name: "FromSoftware", segment: "studio", aliases: ["fromsoftware", "from software", "elden ring", "dark souls", "armored core"], alsoTag: ["Kadokawa"] },
  { name: "Annapurna Interactive", segment: "studio", aliases: ["annapurna interactive", "annapurna games"] },
  { name: "11 bit studios", segment: "studio", aliases: ["11 bit studios", "11 bit", "frostpunk"] },

  // ── Infrastructure / Middleware ──
  { name: "Unity Technologies", segment: "infra", aliases: ["unity technologies", "unity engine", "unity gaming"] },
  { name: "Xsolla", segment: "infra", aliases: ["xsolla"] },
  { name: "Overwolf", segment: "infra", aliases: ["overwolf", "curseforge"] },
  { name: "Discord", segment: "infra", aliases: ["discord"] },
  { name: "Twitch", segment: "infra", aliases: ["twitch"] },

  // ── Investment / Holding ──
  { name: "Savvy Games Group", segment: "investment", aliases: ["savvy games", "savvy gaming"] },
  { name: "Kadokawa", segment: "investment", aliases: ["kadokawa"] },
  { name: "CVC Capital Partners", segment: "investment", aliases: ["cvc capital"] },
  { name: "Access Industries", segment: "investment", aliases: ["access industries"] },
];

/**
 * Build a fast lookup: lowercased alias → CompanyDef.
 * Pre-compile regexes for each alias.
 */
const COMPANY_MATCHERS: { re: RegExp; def: CompanyDef }[] = COMPANY_LIST.flatMap(
  (def) =>
    def.aliases.map((alias) => ({
      re: new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
      def,
    }))
);

/**
 * Match companies mentioned in text. Returns canonical company names.
 * Handles parent tagging (e.g. Riot Games → also tag Tencent).
 */
function matchCompanies(text: string): string[] {
  const matched = new Set<string>();
  for (const { re, def } of COMPANY_MATCHERS) {
    if (re.test(text)) {
      matched.add(def.name);
      if (def.alsoTag) {
        for (const parent of def.alsoTag) matched.add(parent);
      }
    }
  }
  return [...matched];
}

// ── Rule-based: Category from source type ──────────────────────────
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
    if (matchesAny(text, keywords)) {
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

  // Company: rule-based matching with word boundaries + parent tagging
  const companies = matchCompanies(text);

  return {
    category: [...categories],
    platform: [...platforms],
    theme: [...themes],
    company: companies,
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
