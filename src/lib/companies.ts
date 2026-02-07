/**
 * Gaming company data for the company drawer feature.
 * Maps company names (as they appear in tags) to ticker symbols and IR links.
 */

export interface CompanyData {
  name: string;
  ticker: string;
  exchange: string;
  irUrl: string;
  secUrl?: string;
  aliases: string[];
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
  },
  {
    name: "Roblox",
    ticker: "RBLX",
    exchange: "NYSE",
    irUrl: "https://ir.roblox.com/",
    aliases: ["Roblox Corporation"],
  },
  {
    name: "Unity",
    ticker: "U",
    exchange: "NYSE",
    irUrl: "https://investors.unity.com/",
    aliases: ["Unity Software", "Unity Technologies"],
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
  },
  {
    name: "Tencent",
    ticker: "0700.HK",
    exchange: "HKEX",
    irUrl: "https://www.tencent.com/en-us/investors.html",
    aliases: ["Tencent Holdings", "Riot Games", "WeChat"],
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
    name: "Sony",
    ticker: "SONY",
    exchange: "NYSE",
    irUrl: "https://www.sony.com/en/SonyInfo/IR/",
    aliases: ["Sony Interactive Entertainment", "PlayStation", "SIE", "Sony Group"],
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
    name: "Sega Sammy",
    ticker: "6460.T",
    exchange: "TSE",
    irUrl: "https://www.segasammy.co.jp/en/ir/",
    aliases: ["Sega", "SEGA", "Sega Holdings"],
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
