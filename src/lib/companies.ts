/**
 * Gaming company data for the company drawer feature.
 * Maps company names (as they appear in tags) to ticker symbols and IR links.
 * Private companies have ticker: "" — drawer shows segment info instead of stock data.
 * Subsidiaries have parentCompany set — drawer shows a note with parent ticker.
 */

export interface CompanyData {
  name: string;
  ticker: string;
  exchange: string;
  irUrl: string;
  secUrl?: string;
  aliases: string[];
  marketCapB?: number; // Market cap in billions USD (for index weighting)
  /** Set for private companies or companies with no public listing */
  isPrivate?: boolean;
  /** Parent company name if this is a subsidiary (e.g. "Microsoft" for Activision Blizzard) */
  parentCompany?: string;
  /** Human-readable segment label for private company drawer */
  segment?: string;
}

export const GAMING_COMPANIES: CompanyData[] = [
  // US Companies
  {
    name: "Electronic Arts",
    ticker: "EA",
    exchange: "NASDAQ",
    irUrl: "https://ir.ea.com/",
    secUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000712515&type=10-K",
    aliases: ["EA", "Electronic Arts Inc"],
  },
  {
    name: "Take-Two Interactive",
    ticker: "TTWO",
    exchange: "NASDAQ",
    irUrl: "https://ir.take2games.com/",
    secUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000946581&type=10-K",
    aliases: ["Take-Two", "Take Two", "Rockstar", "2K Games", "Zynga"],
    marketCapB: 30, // ~$30B
  },
  {
    name: "Roblox",
    ticker: "RBLX",
    exchange: "NYSE",
    irUrl: "https://ir.roblox.com/",
    aliases: ["Roblox Corporation"],
    marketCapB: 38, // ~$38B
  },
  {
    name: "Unity Technologies",
    ticker: "U",
    exchange: "NYSE",
    irUrl: "https://investors.unity.com/",
    aliases: ["Unity", "Unity Software"],
    marketCapB: 9,
  },
  {
    name: "AppLovin",
    ticker: "APP",
    exchange: "NASDAQ",
    irUrl: "https://investors.applovin.com/",
    aliases: ["AppLovin Corporation"],
  },
  {
    name: "Activision Blizzard",
    ticker: "MSFT",
    exchange: "NASDAQ",
    irUrl: "https://www.microsoft.com/en-us/investor",
    aliases: ["Activision", "Blizzard", "King", "Call of Duty", "ABK"],
    parentCompany: "Microsoft",
    segment: "Studio (Microsoft subsidiary)",
  },
  {
    name: "Tencent",
    ticker: "0700.HK",
    exchange: "HKEX",
    irUrl: "https://www.tencent.com/en-us/investors.html",
    aliases: ["Tencent Holdings", "Riot Games", "WeChat"],
    marketCapB: 450, // ~$450B
  },
  {
    name: "NetEase",
    ticker: "NTES",
    exchange: "NASDAQ",
    irUrl: "https://ir.netease.com/",
    aliases: ["NetEase Inc"],
  },
  {
    name: "Nintendo",
    ticker: "7974.T",
    exchange: "TSE",
    irUrl: "https://www.nintendo.co.jp/ir/en/",
    aliases: ["Nintendo Co", "Nintendo Co Ltd"],
  },
  {
    name: "Sony Interactive",
    ticker: "SONY",
    exchange: "NYSE",
    irUrl: "https://www.sony.com/en/SonyInfo/IR/",
    aliases: ["Sony", "Sony Interactive Entertainment", "PlayStation", "SIE", "Sony Group"],
    marketCapB: 115,
  },
  {
    name: "Capcom",
    ticker: "9697.T",
    exchange: "TSE",
    irUrl: "https://www.capcom.co.jp/ir/english/",
    aliases: ["Capcom Co Ltd"],
  },
  {
    name: "Square Enix",
    ticker: "9684.T",
    exchange: "TSE",
    irUrl: "https://www.hd.square-enix.com/eng/ir/",
    aliases: ["Square Enix Holdings"],
  },
  {
    name: "Ubisoft",
    ticker: "UBI.PA",
    exchange: "EPA",
    irUrl: "https://www.ubisoft.com/en-us/company/investor-center",
    aliases: ["Ubisoft Entertainment"],
  },
  {
    name: "Sea Limited",
    ticker: "SE",
    exchange: "NYSE",
    irUrl: "https://www.sea.com/investor/home",
    aliases: ["Garena", "Sea Ltd"],
  },
  {
    name: "Valve",
    ticker: "",
    exchange: "",
    irUrl: "",
    aliases: ["Valve Corporation", "Steam"],
  },
  {
    name: "Bethesda",
    ticker: "MSFT",
    exchange: "NASDAQ",
    irUrl: "https://www.microsoft.com/en-us/investor",
    aliases: ["Bethesda Softworks", "Bethesda Game Studios", "ZeniMax"],
    parentCompany: "Microsoft",
    segment: "Studio (Microsoft subsidiary)",
  },
  // ── Aream / InvestGame Coverage ──
  {
    name: "GDEV",
    ticker: "GDEV",
    exchange: "NASDAQ",
    irUrl: "https://gdev.inc/investors/",
    aliases: ["GDEV Inc", "Nexters"],
  },
  {
    name: "Stillfront Group",
    ticker: "SF.ST",
    exchange: "STO",
    irUrl: "https://www.stillfront.com/en/investors/",
    aliases: ["Stillfront"],
  },
  {
    name: "Paradox Interactive",
    ticker: "PDX.ST",
    exchange: "STO",
    irUrl: "https://www.paradoxinteractive.com/investors",
    aliases: ["Paradox", "Paradox Games"],
  },
  {
    name: "Keywords Studios",
    ticker: "KWS.L",
    exchange: "LON",
    irUrl: "https://www.keywordsstudios.com/investors/",
    aliases: ["Keywords"],
  },
  {
    name: "Team17",
    ticker: "TM17.L",
    exchange: "LON",
    irUrl: "https://www.team17group.com/investors/",
    aliases: ["Team 17", "Team17 Group"],
  },
  {
    name: "Frontier Developments",
    ticker: "FDEV.L",
    exchange: "LON",
    irUrl: "https://www.frontier.co.uk/investors",
    aliases: ["Frontier Dev", "Frontier"],
  },
  {
    name: "MTG",
    ticker: "MTG-B.ST",
    exchange: "STO",
    irUrl: "https://www.mtg.com/investors/",
    aliases: ["Modern Times Group", "MTG Gaming", "InnoGames"],
  },
  {
    name: "Huuuge",
    ticker: "HUG.WA",
    exchange: "WSE",
    irUrl: "https://ir.huuugegames.com/",
    aliases: ["Huuuge Games", "Huuuge Inc"],
  },
  {
    name: "Warner Bros Discovery",
    ticker: "WBD",
    exchange: "NASDAQ",
    irUrl: "https://ir.wbd.com/",
    aliases: ["WB Games", "Warner Bros Games", "Warner Bros Interactive"],
  },
  {
    name: "DeNA",
    ticker: "2432.T",
    exchange: "TSE",
    irUrl: "https://dena.com/intl/ir/",
    aliases: ["DeNA Co", "DeNA Ltd"],
  },
  {
    name: "Embracer Group",
    ticker: "EMBRAC-B.ST",
    exchange: "STO",
    irUrl: "https://embracer.com/investors/",
    aliases: ["Embracer", "THQ Nordic", "Gearbox", "Crystal Dynamics"],
  },
  {
    name: "CD Projekt",
    ticker: "CDR.WA",
    exchange: "WSE",
    irUrl: "https://www.cdprojekt.com/en/investors/",
    aliases: ["CD Projekt Red", "CDPR", "GOG"],
  },
  {
    name: "Playtika",
    ticker: "PLTK",
    exchange: "NASDAQ",
    irUrl: "https://investors.playtika.com/",
    aliases: ["Playtika Holding"],
  },
  {
    name: "Krafton",
    ticker: "259960.KS",
    exchange: "KRX",
    irUrl: "https://ir.krafton.com/",
    aliases: ["Krafton Inc", "PUBG Corporation"],
  },
  {
    name: "Nexon",
    ticker: "3659.T",
    exchange: "TSE",
    irUrl: "https://ir.nexon.co.jp/en/",
    aliases: ["Nexon Co"],
  },
  {
    name: "Bandai Namco",
    ticker: "7832.T",
    exchange: "TSE",
    irUrl: "https://www.bandainamco.co.jp/en/ir/",
    aliases: ["Bandai Namco Holdings", "Bandai"],
  },
  {
    name: "Sega",
    ticker: "6460.T",
    exchange: "TSE",
    irUrl: "https://www.segasammy.co.jp/en/ir/",
    aliases: ["Sega Sammy", "SEGA", "Sega Holdings", "Sega Sammy Holdings"],
  },
  {
    name: "Konami",
    ticker: "9766.T",
    exchange: "TSE",
    irUrl: "https://www.konami.com/ir/en/",
    aliases: ["Konami Holdings", "Konami Digital"],
  },
  {
    name: "Microsoft",
    ticker: "MSFT",
    exchange: "NASDAQ",
    irUrl: "https://www.microsoft.com/en-us/investor",
    aliases: ["Microsoft Gaming", "Xbox", "Xbox Game Studios"],
    marketCapB: 3100, // ~$3.1T
  },
  // ── AS Primitives Index additions ──
  // Market caps in billions USD (approximate, for index weighting)
  {
    name: "Apple",
    ticker: "AAPL",
    exchange: "NASDAQ",
    irUrl: "https://investor.apple.com/",
    aliases: ["Apple Inc", "Vision Pro"],
    marketCapB: 3400, // ~$3.4T
  },
  {
    name: "Coinbase",
    ticker: "COIN",
    exchange: "NASDAQ",
    irUrl: "https://investor.coinbase.com/",
    aliases: ["Coinbase Global", "BASE"],
    marketCapB: 65, // ~$65B
  },
  {
    name: "Google",
    ticker: "GOOGL",
    exchange: "NASDAQ",
    irUrl: "https://abc.xyz/investor/",
    aliases: ["Alphabet", "Alphabet Inc", "YouTube Gaming", "Stadia"],
    marketCapB: 2300, // ~$2.3T
  },
  {
    name: "Meta",
    ticker: "META",
    exchange: "NASDAQ",
    irUrl: "https://investor.fb.com/",
    aliases: ["Meta Platforms", "Facebook", "Quest", "Horizon", "Oculus"],
    marketCapB: 1500, // ~$1.5T
  },
  {
    name: "Nvidia",
    ticker: "NVDA",
    exchange: "NASDAQ",
    irUrl: "https://investor.nvidia.com/",
    aliases: ["NVIDIA Corporation", "GeForce", "GeForce Now"],
    marketCapB: 3200, // ~$3.2T
  },
  {
    name: "Samsung",
    ticker: "005930.KS",
    exchange: "KRX",
    irUrl: "https://www.samsung.com/global/ir/",
    aliases: ["Samsung Electronics", "Samsung Gaming"],
    marketCapB: 280, // ~$280B
  },
  {
    name: "Snap",
    ticker: "SNAP",
    exchange: "NYSE",
    irUrl: "https://investor.snap.com/",
    aliases: ["Snap Inc", "Snapchat", "Spectacles", "Lens Studio"],
    marketCapB: 18,
  },
  // ── Public companies missing from original list ──
  {
    name: "Epic Games",
    ticker: "",
    exchange: "",
    irUrl: "https://www.epicgames.com/site/en-US/news",
    aliases: ["Epic", "Unreal Engine", "Epic Games Store", "Fortnite"],
    isPrivate: true,
    segment: "Platform / Publisher",
  },
  {
    name: "miHoYo",
    ticker: "",
    exchange: "",
    irUrl: "https://www.hoyoverse.com/en-us/",
    aliases: ["HoYoverse", "Genshin Impact", "Honkai Star Rail", "miHoYo"],
    isPrivate: true,
    segment: "Asian Publisher (Private)",
  },
  {
    name: "Riot Games",
    ticker: "0700.HK",
    exchange: "HKEX",
    irUrl: "https://www.tencent.com/en-us/investors.html",
    aliases: ["Riot", "League of Legends", "Valorant"],
    parentCompany: "Tencent",
    segment: "Studio (Tencent subsidiary)",
  },
  {
    name: "Bungie",
    ticker: "SONY",
    exchange: "NYSE",
    irUrl: "https://www.sony.com/en/SonyInfo/IR/",
    aliases: ["Bungie Inc", "Destiny 2", "Marathon"],
    parentCompany: "Sony Interactive",
    segment: "Studio (Sony subsidiary)",
  },
  {
    name: "Supercell",
    ticker: "0700.HK",
    exchange: "HKEX",
    irUrl: "https://www.tencent.com/en-us/investors.html",
    aliases: ["Clash of Clans", "Brawl Stars", "Clash Royale"],
    parentCompany: "Tencent",
    segment: "Mobile Studio (Tencent subsidiary)",
  },
  {
    name: "Scopely",
    ticker: "",
    exchange: "",
    irUrl: "https://scopely.com/",
    aliases: ["Monopoly Go", "Scopely Inc"],
    isPrivate: true,
    segment: "Mobile Publisher",
  },
  {
    name: "Larian Studios",
    ticker: "",
    exchange: "",
    irUrl: "https://larian.com/",
    aliases: ["Larian", "Baldur's Gate 3", "Baldurs Gate"],
    isPrivate: true,
    segment: "PC/Console Studio (Private)",
  },
  {
    name: "FromSoftware",
    ticker: "9468.T",
    exchange: "TSE",
    irUrl: "https://www.kadokawa.co.jp/en/ir/",
    aliases: ["From Software", "Elden Ring", "Dark Souls", "Armored Core"],
    parentCompany: "Kadokawa",
    segment: "Studio (Kadokawa subsidiary)",
  },
  {
    name: "Annapurna Interactive",
    ticker: "",
    exchange: "",
    irUrl: "https://annapurnainteractive.com/",
    aliases: ["Annapurna Games", "Annapurna"],
    isPrivate: true,
    segment: "Indie Publisher (Private)",
  },
  {
    name: "Devolver Digital",
    ticker: "DEVB.ST",
    exchange: "STO",
    irUrl: "https://www.devolverdigital.com/",
    aliases: ["Devolver"],
  },
  {
    name: "11 bit studios",
    ticker: "11B.WA",
    exchange: "WSE",
    irUrl: "https://ir.11bitstudios.com/",
    aliases: ["11 bit", "Frostpunk", "This War of Mine"],
  },
  {
    name: "Coffee Stain Group",
    ticker: "EMBRAC-B.ST",
    exchange: "STO",
    irUrl: "https://embracer.com/investors/",
    aliases: ["Coffee Stain", "Coffee Stain Studios", "Deep Rock Galactic", "Satisfactory"],
    parentCompany: "Embracer Group",
    segment: "Studio (Embracer subsidiary)",
  },
  {
    name: "Niantic",
    ticker: "",
    exchange: "",
    irUrl: "https://nianticlabs.com/",
    aliases: ["Niantic Labs", "Pokemon Go", "Pokémon Go"],
    isPrivate: true,
    segment: "Mobile / AR (Private)",
  },
  {
    name: "Moon Active",
    ticker: "",
    exchange: "",
    irUrl: "https://moonactive.com/",
    aliases: ["Coin Master"],
    isPrivate: true,
    segment: "Mobile (Private)",
  },
  {
    name: "Dream Games",
    ticker: "",
    exchange: "",
    irUrl: "https://www.dreamgames.com/",
    aliases: ["Royal Match"],
    isPrivate: true,
    segment: "Mobile (Private)",
  },
  {
    name: "Habby",
    ticker: "",
    exchange: "",
    irUrl: "https://habby.com/",
    aliases: ["Archero", "Survivor.io"],
    isPrivate: true,
    segment: "Mobile (Private)",
  },
  {
    name: "Jam City",
    ticker: "",
    exchange: "",
    irUrl: "https://jamcity.com/",
    aliases: [],
    isPrivate: true,
    segment: "Mobile (Private)",
  },
  {
    name: "Rovio",
    ticker: "6460.T",
    exchange: "TSE",
    irUrl: "https://www.segasammy.co.jp/en/ir/",
    aliases: ["Angry Birds"],
    parentCompany: "Sega",
    segment: "Mobile Studio (Sega subsidiary)",
  },
  {
    name: "Voodoo",
    ticker: "",
    exchange: "",
    irUrl: "https://www.voodoo.io/",
    aliases: [],
    isPrivate: true,
    segment: "Mobile (Private)",
  },
  {
    name: "Tripledot Studios",
    ticker: "",
    exchange: "",
    irUrl: "https://tripledotstudios.com/",
    aliases: ["Tripledot"],
    isPrivate: true,
    segment: "Mobile (Private)",
  },
  {
    name: "ByteDance",
    ticker: "",
    exchange: "",
    irUrl: "https://www.bytedance.com/en/",
    aliases: ["Nuverse", "TikTok"],
    isPrivate: true,
    segment: "Tech / Gaming (Private)",
  },
  {
    name: "Kakao Games",
    ticker: "293490.KS",
    exchange: "KRX",
    irUrl: "https://ir.kakaogames.com/",
    aliases: ["Kakao"],
  },
  {
    name: "Pearl Abyss",
    ticker: "263750.KS",
    exchange: "KRX",
    irUrl: "https://ir.pearlabyss.com/en/",
    aliases: ["Black Desert", "Crimson Desert"],
  },
  {
    name: "Shift Up",
    ticker: "462870.KS",
    exchange: "KRX",
    irUrl: "https://www.shift-up.co.kr/",
    aliases: ["Stellar Blade", "NIKKE"],
  },
  {
    name: "NCSoft",
    ticker: "036570.KS",
    exchange: "KRX",
    irUrl: "https://ir.ncsoft.com/en",
    aliases: ["Throne and Liberty", "Guild Wars"],
  },
  {
    name: "Com2uS",
    ticker: "078340.KS",
    exchange: "KRX",
    irUrl: "https://company.com2us.com/investor/",
    aliases: ["Summoners War"],
  },
  {
    name: "Lilith Games",
    ticker: "",
    exchange: "",
    irUrl: "https://www.lilithgames.com/",
    aliases: ["Lilith"],
    isPrivate: true,
    segment: "Mobile (Private)",
  },
  {
    name: "Miniclip",
    ticker: "0700.HK",
    exchange: "HKEX",
    irUrl: "https://www.tencent.com/en-us/investors.html",
    aliases: ["8 Ball Pool"],
    parentCompany: "Tencent",
    segment: "Mobile (Tencent subsidiary)",
  },
  {
    name: "Xsolla",
    ticker: "",
    exchange: "",
    irUrl: "https://xsolla.com/",
    aliases: [],
    isPrivate: true,
    segment: "Gaming Infrastructure (Private)",
  },
  {
    name: "Overwolf",
    ticker: "",
    exchange: "",
    irUrl: "https://www.overwolf.com/",
    aliases: ["CurseForge"],
    isPrivate: true,
    segment: "Gaming Infrastructure (Private)",
  },
  {
    name: "Discord",
    ticker: "",
    exchange: "",
    irUrl: "https://discord.com/",
    aliases: [],
    isPrivate: true,
    segment: "Gaming Infrastructure (Private)",
  },
  {
    name: "Twitch",
    ticker: "AMZN",
    exchange: "NASDAQ",
    irUrl: "https://ir.aboutamazon.com/",
    aliases: [],
    parentCompany: "Amazon",
    segment: "Streaming (Amazon subsidiary)",
  },
  {
    name: "Savvy Games Group",
    ticker: "",
    exchange: "",
    irUrl: "https://savvygames.com/",
    aliases: ["Savvy Games", "Savvy Gaming"],
    isPrivate: true,
    segment: "Investment / Holding (Saudi PIF)",
  },
  {
    name: "Kadokawa",
    ticker: "9468.T",
    exchange: "TSE",
    irUrl: "https://www.kadokawa.co.jp/en/ir/",
    aliases: ["Kadokawa Corporation"],
  },
  {
    name: "CVC Capital Partners",
    ticker: "CVC.AS",
    exchange: "AMS",
    irUrl: "https://www.cvc.com/investors/",
    aliases: ["CVC Capital"],
  },
  {
    name: "Access Industries",
    ticker: "",
    exchange: "",
    irUrl: "https://www.accessindustries.com/",
    aliases: [],
    isPrivate: true,
    segment: "Investment / Holding (Private)",
  },
];

export function findCompanyByName(name: string): CompanyData | null {
  const normalized = name.toLowerCase().trim();
  
  for (const company of GAMING_COMPANIES) {
    if (company.name.toLowerCase() === normalized) {
      return company;
    }
    for (const alias of company.aliases) {
      if (alias.toLowerCase() === normalized) {
        return company;
      }
    }
  }
  
  for (const company of GAMING_COMPANIES) {
    if (company.name.toLowerCase().includes(normalized) || 
        normalized.includes(company.name.toLowerCase())) {
      return company;
    }
    for (const alias of company.aliases) {
      if (alias.toLowerCase().includes(normalized) || 
          normalized.includes(alias.toLowerCase())) {
        return company;
      }
    }
  }
  
  return null;
}

export function isPublicCompany(name: string): boolean {
  const company = findCompanyByName(name);
  return company !== null && company.ticker !== "";
}
