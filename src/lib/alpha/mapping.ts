export interface CompanyMapping {
  igdbId: number;
  ticker: string;
  alphaId: string;
}

const companyMappings: Record<number, CompanyMapping> = {
  51: { igdbId: 51, ticker: "NTDOY", alphaId: "NTDOY" },    // Nintendo
  1: { igdbId: 1, ticker: "SONY", alphaId: "SONY" },        // Sony
  4: { igdbId: 4, ticker: "MSFT", alphaId: "MSFT" },        // Microsoft
  2: { igdbId: 2, ticker: "EA", alphaId: "EA" },            // Electronic Arts
  339: { igdbId: 339, ticker: "TTWO", alphaId: "TTWO" },    // Take-Two
  47: { igdbId: 47, ticker: "UBSFY", alphaId: "UBSFY" }     // Ubisoft
};

export function getCompanyMapping(igdbId: number): CompanyMapping | null {
  console.log('Getting mapping for IGDB ID:', igdbId, 'Available mappings:', companyMappings);
  const mapping = companyMappings[igdbId];
  console.log('Found mapping:', mapping);
  return mapping || null;
} 