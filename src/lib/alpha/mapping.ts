export interface CompanyMapping {
  igdbId: number;
  ticker: string;
  yahooId: string;
}

const companyMappings: Record<number, CompanyMapping> = {
  51: { igdbId: 51, ticker: "NTDOY", yahooId: "NTDOY" },    // Nintendo
  1: { igdbId: 1, ticker: "SONY", yahooId: "SONY" },        // Sony
  4: { igdbId: 4, ticker: "MSFT", yahooId: "MSFT" },        // Microsoft
  2: { igdbId: 2, ticker: "EA", yahooId: "EA" },            // Electronic Arts
  339: { igdbId: 339, ticker: "TTWO", yahooId: "TTWO" },    // Take-Two
  47: { igdbId: 47, ticker: "UBSFY", yahooId: "UBSFY" }     // Ubisoft
};

export function getCompanyMapping(igdbId: number): CompanyMapping | null {
  return companyMappings[igdbId] || null;
} 