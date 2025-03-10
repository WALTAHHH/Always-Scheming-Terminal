export interface IGDBImage {
  id: number;
  image_id: string;
  url: string;
  width: number;
  height: number;
}

export interface IGDBCompany {
  id: number;
  name: string;
  slug: string;
  description?: string;
  country?: number;
  website?: string;
  url?: string;
  websites?: IGDBWebsite[];
  logo?: IGDBImage;
  developed?: IGDBGame[];
  published?: IGDBGame[];
  parent_company?: number;
  changed_company_id?: number;
  start_date?: number;
}

export interface IGDBGame {
  id: number;
  name: string;
  slug: string;
  first_release_date?: number;
  rating?: number;
  cover?: IGDBImage;
  platforms?: IGDBPlatform[];
  genres?: IGDBGenre[];
  involved_companies?: IGDBInvolvedCompany[];
}

export interface IGDBPlatform {
  id: number;
  name: string;
  slug: string;
}

export interface IGDBGenre {
  id: number;
  name: string;
  slug: string;
}

export interface IGDBInvolvedCompany {
  id: number;
  company: IGDBCompany;
  developer: boolean;
  publisher: boolean;
}

export interface IGDBWebsite {
  id: number;
  url: string;
  category: number;
}