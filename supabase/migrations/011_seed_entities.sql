-- Migration: Seed entities and entity_aliases tables from company-list-v1.md
-- 76 companies across 9 segments
-- Subsidiaries with parent relationships: Activision Blizzard, Bethesda, Bungie, Riot, FromSoftware, Rovio, Twitch, ironSource, Coffee Stain

BEGIN;

-- Insert entities (all 76 companies)
-- Using gen_random_uuid() for ids, ON CONFLICT DO NOTHING for re-runnability

INSERT INTO entities (id, canonical_name, entity_type, ticker, exchange, is_public, parent_id, segment, market_cap_b, description)
VALUES
  -- 1. Platform Holders & Big Tech
  (gen_random_uuid(), 'Microsoft Gaming', 'company', 'MSFT', 'NASDAQ', true, NULL, 'Platform Holders & Big Tech', 3100, 'Xbox, Activision Blizzard, Bethesda, Mojang'),
  (gen_random_uuid(), 'Sony Interactive Entertainment', 'company', 'SONY', 'NYSE', true, NULL, 'Platform Holders & Big Tech', 110, 'PlayStation, Bungie, Insomniac, Firewalk'),
  (gen_random_uuid(), 'Nintendo', 'company', '7974.T', 'TSE', true, NULL, 'Platform Holders & Big Tech', 60, 'Switch, first-party IP juggernaut'),
  (gen_random_uuid(), 'Apple', 'company', 'AAPL', 'NASDAQ', true, NULL, 'Platform Holders & Big Tech', 3500, 'App Store, Apple Arcade'),
  (gen_random_uuid(), 'Google', 'company', 'GOOGL', 'NASDAQ', true, NULL, 'Platform Holders & Big Tech', 2100, 'Google Play, Stadia (shut down), YouTube Gaming'),
  (gen_random_uuid(), 'Valve', 'company', NULL, NULL, false, NULL, 'Platform Holders & Big Tech', NULL, 'Steam, Half-Life, Dota 2, Counter-Strike'),
  (gen_random_uuid(), 'Epic Games', 'company', NULL, NULL, false, NULL, 'Platform Holders & Big Tech', NULL, 'Unreal Engine, Fortnite, Epic Games Store'),
  (gen_random_uuid(), 'Roblox', 'company', 'RBLX', 'NYSE', true, NULL, 'Platform Holders & Big Tech', 25, 'UGC platform, virtual economy, kids/teens'),
  (gen_random_uuid(), 'Meta', 'company', 'META', 'NASDAQ', true, NULL, 'Platform Holders & Big Tech', 1300, 'Quest VR, Horizon, Reality Labs'),
  
  -- 2. Major Western Publishers (Public)
  (gen_random_uuid(), 'Electronic Arts', 'company', 'EA', 'NASDAQ', true, NULL, 'Major Western Publishers', 40, 'FIFA/EA FC, Apex Legends, The Sims, live services'),
  (gen_random_uuid(), 'Take-Two Interactive', 'company', 'TTWO', 'NASDAQ', true, NULL, 'Major Western Publishers', 32, 'Rockstar (GTA), 2K Sports, Zynga (mobile)'),
  (gen_random_uuid(), 'Ubisoft', 'company', 'UBI.PA', 'Euronext Paris', true, NULL, 'Major Western Publishers', 2.5, 'Assassin''s Creed, Rainbow Six, Far Cry'),
  (gen_random_uuid(), 'Embracer Group', 'company', 'EMBRACB.ST', 'Nasdaq Stockholm', true, NULL, 'Major Western Publishers', 1.2, 'THQ Nordic, Gearbox, Crystal Dynamics, massive M&A spree then restructuring'),
  (gen_random_uuid(), 'CD Projekt', 'company', 'CDR.WA', 'WSE', true, NULL, 'Major Western Publishers', 3.5, 'Cyberpunk 2077, The Witcher, GOG.com'),
  (gen_random_uuid(), 'Devolver Digital', 'company', 'DEVO.L', 'LSE', true, NULL, 'Major Western Publishers', 0.5, 'Indie publisher, cult following'),
  
  -- 3. Major Asian Publishers
  (gen_random_uuid(), 'Tencent', 'company', '0700.HK', 'HKEX', true, NULL, 'Major Asian Publishers', 450, 'World''s largest gaming company by revenue. Stakes in Riot, Supercell, Epic, Ubisoft'),
  (gen_random_uuid(), 'NetEase', 'company', 'NTES', 'NASDAQ', true, NULL, 'Major Asian Publishers', 60, 'China #2, Blizzard partner (China), own studios'),
  (gen_random_uuid(), 'Nexon', 'company', '3659.T', 'TSE', true, NULL, 'Major Asian Publishers', 15, 'MapleStory, Dungeon Fighter, Korea/Japan giant'),
  (gen_random_uuid(), 'Krafton', 'company', '259960.KQ', 'KRX', true, NULL, 'Major Asian Publishers', 18, 'PUBG, India expansion, aggressive M&A'),
  (gen_random_uuid(), 'Bandai Namco', 'company', '7832.T', 'TSE', true, NULL, 'Major Asian Publishers', 14, 'Elden Ring, Tekken, Dragon Ball, anime IP'),
  (gen_random_uuid(), 'Capcom', 'company', '9697.T', 'TSE', true, NULL, 'Major Asian Publishers', 7, 'Monster Hunter, Resident Evil, Street Fighter'),
  (gen_random_uuid(), 'Square Enix', 'company', '9684.T', 'TSE', true, NULL, 'Major Asian Publishers', 5, 'Final Fantasy, Dragon Quest, sold western studios'),
  (gen_random_uuid(), 'Sega', 'company', '6460.T', 'TSE', true, NULL, 'Major Asian Publishers', 3.5, 'Sonic, Yakuza/Like a Dragon, acquired Rovio'),
  (gen_random_uuid(), 'Konami', 'company', '9766.T', 'TSE', true, NULL, 'Major Asian Publishers', 7.5, 'Metal Gear, eFootball, pivoted to mobile/pachinko, returning to AAA'),
  (gen_random_uuid(), 'miHoYo', 'company', NULL, NULL, false, NULL, 'Major Asian Publishers', NULL, 'Genshin Impact, Honkai Star Rail, Chinese gacha powerhouse'),
  (gen_random_uuid(), 'Netmarble', 'company', '251270.KQ', 'KRX', true, NULL, 'Major Asian Publishers', 6, 'Lineage, Marvel Future Fight, Korean mobile'),
  (gen_random_uuid(), 'Pearl Abyss', 'company', '263750.KQ', 'KRX', true, NULL, 'Major Asian Publishers', 2, 'Black Desert, Crimson Desert'),
  (gen_random_uuid(), 'Shift Up', 'company', '462870.KQ', 'KRX', true, NULL, 'Major Asian Publishers', 1.5, 'Stellar Blade, Nikke — recent IPO darling'),
  (gen_random_uuid(), 'NCSoft', 'company', '036570.KQ', 'KRX', true, NULL, 'Major Asian Publishers', 4, 'Lineage, Throne and Liberty, struggling transition'),
  (gen_random_uuid(), 'Com2uS', 'company', '078340.KQ', 'KRX', true, NULL, 'Major Asian Publishers', 0.8, 'Summoners War, blockchain gaming push'),
  (gen_random_uuid(), 'Sea Limited', 'company', 'SE', 'NYSE', true, NULL, 'Major Asian Publishers', 22, 'Free Fire, Southeast Asia distribution'),
  (gen_random_uuid(), 'Lilith Games', 'company', NULL, NULL, false, NULL, 'Major Asian Publishers', NULL, 'AFK Arena, Rise of Kingdoms, China mobile'),
  (gen_random_uuid(), 'ByteDance', 'company', NULL, NULL, false, NULL, 'Major Asian Publishers', NULL, 'Nuverse gaming division, TikTok cross-promotion'),
  (gen_random_uuid(), 'Kakao Games', 'company', '293490.KQ', 'KRX', true, NULL, 'Major Asian Publishers', 1.2, 'Korean publisher/platform, ODIN'),
  
  -- 4. Mobile-First / F2P Specialists
  (gen_random_uuid(), 'Supercell', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Tencent'), 'Mobile-First / F2P', NULL, 'Clash of Clans, Brawl Stars, gold standard F2P'),
  (gen_random_uuid(), 'Playtika', 'company', 'PLTK', 'NASDAQ', true, NULL, 'Mobile-First / F2P', 2.5, 'Social casino, live ops expertise'),
  (gen_random_uuid(), 'AppLovin', 'company', 'APP', 'NASDAQ', true, NULL, 'Mobile-First / F2P', 30, 'Ad tech + games portfolio, MAX mediation'),
  (gen_random_uuid(), 'Scopely', 'company', NULL, NULL, false, NULL, 'Mobile-First / F2P', NULL, 'Marvel Strike Force, Monopoly GO, acquired by Savvy Games'),
  (gen_random_uuid(), 'Moon Active', 'company', NULL, NULL, false, NULL, 'Mobile-First / F2P', NULL, 'Coin Master, Israel-based'),
  (gen_random_uuid(), 'Dream Games', 'company', NULL, NULL, false, NULL, 'Mobile-First / F2P', NULL, 'Royal Match, Turkey-based, unicorn'),
  (gen_random_uuid(), 'Habby', 'company', NULL, NULL, false, NULL, 'Mobile-First / F2P', NULL, 'Archero, Survivor.io, China hyper-casual'),
  (gen_random_uuid(), 'Jam City', 'company', NULL, NULL, false, NULL, 'Mobile-First / F2P', NULL, 'Harry Potter, Disney games'),
  (gen_random_uuid(), 'Niantic', 'company', NULL, NULL, false, NULL, 'Mobile-First / F2P', NULL, 'Pokémon GO, AR gaming'),
  (gen_random_uuid(), 'Miniclip', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Tencent'), 'Mobile-First / F2P', NULL, '8 Ball Pool, casual mobile'),
  (gen_random_uuid(), 'Voodoo', 'company', NULL, NULL, false, NULL, 'Mobile-First / F2P', NULL, 'Hyper-casual pioneer, shifting to hybrid casual'),
  (gen_random_uuid(), 'Tripledot Studios', 'company', NULL, NULL, false, NULL, 'Mobile-First / F2P', NULL, 'Solitaire, casual games, UK-based'),
  
  -- 5. PC/Console Studios & Indies
  (gen_random_uuid(), 'Larian Studios', 'company', NULL, NULL, false, NULL, 'PC/Console Studios & Indies', NULL, 'Baldur''s Gate 3, Belgian, critical darling'),
  (gen_random_uuid(), 'Annapurna Interactive', 'company', NULL, NULL, false, NULL, 'PC/Console Studios & Indies', NULL, 'Premium indie publisher, parent filed bankruptcy'),
  (gen_random_uuid(), '11 bit studios', 'company', '11B.WA', 'WSE', true, NULL, 'PC/Console Studios & Indies', 0.4, 'Frostpunk, This War of Mine, Polish'),
  
  -- 6. Mid-Market / European Publishers
  (gen_random_uuid(), 'GDEV', 'company', 'GDEV', 'NASDAQ', true, NULL, 'Mid-Market / European Publishers', 0.3, 'Nexters parent, mobile publisher'),
  (gen_random_uuid(), 'Stillfront Group', 'company', 'SF.ST', 'Nasdaq Stockholm', true, NULL, 'Mid-Market / European Publishers', 0.6, 'Mobile strategy/simulation publisher, Swedish'),
  (gen_random_uuid(), 'Paradox Interactive', 'company', 'PDX.ST', 'Nasdaq Stockholm', true, NULL, 'Mid-Market / European Publishers', 1.8, 'Cities Skylines, Crusader Kings, grand strategy'),
  (gen_random_uuid(), 'Keywords Studios', 'company', 'KWS.L', 'LSE', true, NULL, 'Mid-Market / European Publishers', 2.2, 'Outsourced game dev services, largest in sector'),
  (gen_random_uuid(), 'Team17', 'company', 'TM17.L', 'LSE', true, NULL, 'Mid-Market / European Publishers', 0.4, 'Worms, Overcooked, indie publishing'),
  (gen_random_uuid(), 'Frontier Developments', 'company', 'FDEV.L', 'LSE', true, NULL, 'Mid-Market / European Publishers', 0.5, 'Elite Dangerous, Planet Coaster/Zoo, sim specialist'),
  (gen_random_uuid(), 'Modern Times Group', 'company', 'MTG-B.ST', 'Nasdaq Stockholm', true, NULL, 'Mid-Market / European Publishers', 1.0, 'InnoGames, Kongregate, gaming holding'),
  (gen_random_uuid(), 'Huuuge', 'company', 'HUG.WA', 'WSE', true, NULL, 'Mid-Market / European Publishers', 0.3, 'Social casino, Huuuge Casino, Polish'),
  (gen_random_uuid(), 'Warner Bros Games', 'company', 'WBD', 'NASDAQ', true, NULL, 'Mid-Market / European Publishers', 30, 'Hogwarts Legacy, Mortal Kombat, MultiVersus'),
  (gen_random_uuid(), 'DeNA', 'company', '2432.T', 'TSE', true, NULL, 'Mid-Market / European Publishers', 2.3, 'Nintendo mobile partner, Pokémon Masters, Japanese mobile'),
  
  -- 7. Infrastructure / Middleware / Services
  (gen_random_uuid(), 'Unity Technologies', 'company', 'U', 'NYSE', true, NULL, 'Infrastructure / Middleware', 8, 'Unity engine, ad monetization, runtime fee controversy'),
  (gen_random_uuid(), 'Xsolla', 'company', NULL, NULL, false, NULL, 'Infrastructure / Middleware', NULL, 'Payments, launcher, game commerce'),
  (gen_random_uuid(), 'Overwolf', 'company', NULL, NULL, false, NULL, 'Infrastructure / Middleware', NULL, 'Modding platform, CurseForge'),
  (gen_random_uuid(), 'Discord', 'company', NULL, NULL, false, NULL, 'Infrastructure / Middleware', NULL, 'Voice/text platform, gaming community backbone'),
  
  -- 8. Investment / Holding / Corporate
  (gen_random_uuid(), 'Savvy Games Group', 'company', NULL, NULL, false, NULL, 'Investment / Holding', NULL, 'Saudi sovereign fund gaming arm, huge war chest, acquired Scopely'),
  (gen_random_uuid(), 'Kadokawa', 'company', '9468.T', 'TSE', true, NULL, 'Investment / Holding', 3.8, 'FromSoftware parent, anime/games conglomerate'),
  (gen_random_uuid(), 'CVC Capital Partners', 'company', NULL, NULL, false, NULL, 'Investment / Holding', NULL, 'Private equity, Voodoo investor'),
  (gen_random_uuid(), 'Access Industries', 'company', NULL, NULL, false, NULL, 'Investment / Holding', NULL, 'Warner Bros Games (via Warner Bros Discovery)')
ON CONFLICT (canonical_name) DO NOTHING;

-- Now insert subsidiaries with parent relationships
INSERT INTO entities (id, canonical_name, entity_type, ticker, exchange, is_public, parent_id, segment, market_cap_b, description)
VALUES
  (gen_random_uuid(), 'Activision Blizzard', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Microsoft Gaming'), 'PC/Console Studios & Indies', NULL, 'WoW, Call of Duty, Diablo, King (Candy Crush)'),
  (gen_random_uuid(), 'Bethesda', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Microsoft Gaming'), 'PC/Console Studios & Indies', NULL, 'Elder Scrolls, Fallout, Doom, Starfield'),
  (gen_random_uuid(), 'Bungie', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Sony Interactive Entertainment'), 'PC/Console Studios & Indies', NULL, 'Destiny, Marathon, live service'),
  (gen_random_uuid(), 'Riot Games', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Tencent'), 'PC/Console Studios & Indies', NULL, 'League of Legends, Valorant, esports'),
  (gen_random_uuid(), 'FromSoftware', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Kadokawa'), 'PC/Console Studios & Indies', NULL, 'Elden Ring, Dark Souls, Armored Core'),
  (gen_random_uuid(), 'Rovio', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Sega'), 'Mobile-First / F2P', NULL, 'Angry Birds franchise'),
  (gen_random_uuid(), 'Twitch', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Amazon'), 'Infrastructure / Middleware', NULL, 'Live streaming, creator economy'),
  (gen_random_uuid(), 'ironSource', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Unity Technologies'), 'Infrastructure / Middleware', NULL, 'Ad mediation, merged with Unity'),
  (gen_random_uuid(), 'Coffee Stain', 'company', NULL, NULL, false, (SELECT id FROM entities WHERE canonical_name = 'Embracer Group'), 'Mid-Market / European Publishers', NULL, 'Deep Rock Galactic, Satisfactory, Goat Simulator')
ON CONFLICT (canonical_name) DO NOTHING;

-- Add Amazon parent for Twitch (not in original list but needed for Twitch parent_id)
INSERT INTO entities (id, canonical_name, entity_type, ticker, exchange, is_public, parent_id, segment, market_cap_b, description)
VALUES
  (gen_random_uuid(), 'Amazon', 'company', 'AMZN', 'NASDAQ', true, NULL, 'Platform Holders & Big Tech', 2100, 'AWS, Twitch, Amazon Luna, Prime Gaming')
ON CONFLICT (canonical_name) DO NOTHING;

-- Update Twitch parent_id after Amazon insert
UPDATE entities
SET parent_id = (SELECT id FROM entities WHERE canonical_name = 'Amazon')
WHERE canonical_name = 'Twitch' AND parent_id IS NULL;

-- Update Scopely parent_id after Savvy Games Group insert
UPDATE entities
SET parent_id = (SELECT id FROM entities WHERE canonical_name = 'Savvy Games Group')
WHERE canonical_name = 'Scopely' AND parent_id IS NULL;

-- Insert entity_aliases
-- Canonical aliases for all entities
INSERT INTO entity_aliases (id, entity_id, alias, alias_type)
SELECT 
  gen_random_uuid(),
  e.id,
  e.canonical_name,
  'canonical'
FROM entities e
WHERE e.entity_type = 'company'
ON CONFLICT (alias) DO NOTHING;

-- Ticker aliases for public companies
INSERT INTO entity_aliases (id, entity_id, alias, alias_type)
SELECT 
  gen_random_uuid(),
  e.id,
  e.ticker,
  'ticker'
FROM entities e
WHERE e.entity_type = 'company' AND e.ticker IS NOT NULL
ON CONFLICT (alias) DO NOTHING;

-- Common aliases and abbreviations
INSERT INTO entity_aliases (id, entity_id, alias, alias_type)
VALUES
  -- Platform holders
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Microsoft Gaming'), 'Xbox', 'product'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Microsoft Gaming'), 'MSFT Gaming', 'common'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Sony Interactive Entertainment'), 'PlayStation', 'product'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Sony Interactive Entertainment'), 'SIE', 'abbreviation'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Epic Games'), 'Epic', 'common'),
  
  -- Publishers
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Electronic Arts'), 'EA', 'abbreviation'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Take-Two Interactive'), 'Take-Two', 'common'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Take-Two Interactive'), 'T2', 'abbreviation'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Activision Blizzard'), 'Activision', 'common'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Activision Blizzard'), 'Blizzard', 'common'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Activision Blizzard'), 'ABK', 'abbreviation'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Bethesda'), 'ZeniMax', 'former_name'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'miHoYo'), 'HoYoverse', 'common'),
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Sea Limited'), 'Garena', 'common'),
  
  -- Subsidiaries common names
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Riot Games'), 'Riot', 'common'),
  
  -- Infrastructure
  (gen_random_uuid(), (SELECT id FROM entities WHERE canonical_name = 'Modern Times Group'), 'MTG', 'abbreviation')
ON CONFLICT (alias) DO NOTHING;

COMMIT;
