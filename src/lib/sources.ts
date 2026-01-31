// V1 source definitions for seeding the database
export const V1_SOURCES = [
  {
    name: "Naavik",
    url: "https://naavik.co",
    feed_url: "https://naavik.co/feed",
    source_type: "newsletter",
  },
  {
    name: "Deconstructor of Fun",
    url: "https://www.deconstructoroffun.com",
    feed_url: "https://www.deconstructoroffun.com/blog?format=rss",
    source_type: "newsletter",
  },
  {
    name: "GameDiscoverCo",
    url: "https://gamediscover.co",
    feed_url: "https://newsletter.gamediscover.co/feed",
    source_type: "newsletter",
  },
  {
    name: "MobileGamer.biz",
    url: "https://mobilegamer.biz",
    feed_url: "https://mobilegamer.biz/feed/",
    source_type: "news",
  },
  {
    name: "GamesIndustry.biz",
    url: "https://www.gamesindustry.biz",
    feed_url: "https://www.gamesindustry.biz/feed",
    source_type: "news",
  },
  {
    name: "Game File",
    url: "https://www.gamefile.news",
    feed_url: "https://www.gamefile.news/feed",
    source_type: "newsletter",
  },
  {
    name: "InvestGame",
    url: "https://investgame.net",
    feed_url: "https://investgame.net/feed",
    source_type: "analysis",
  },
  {
    name: "Elite Game Developers",
    url: "https://elitegamedevelopers.substack.com",
    feed_url: "https://elitegamedevelopers.substack.com/feed",
    source_type: "newsletter",
  },
] as const;
