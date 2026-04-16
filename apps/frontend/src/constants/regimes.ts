import type { RegimeId } from "@/components/wallet/regime/regimeData";

/**
 * Gets default quote for a regime when sentiment data is unavailable
 */
export function getDefaultQuoteForRegime(regimeId: RegimeId): string {
  const quotes: Record<RegimeId, string> = {
    ef: "Market panic creates opportunities for disciplined investors.",
    f: "Cautiously increase exposure as sentiment improves.",
    n: "Maintain balanced position across market cycles.",
    g: "Market conditions favor aggressive positioning with higher allocation to growth assets.",
    eg: "Extreme optimism requires caution - protect gains and prepare for reversal.",
  };
  return quotes[regimeId];
}
