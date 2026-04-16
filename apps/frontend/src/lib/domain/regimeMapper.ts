/**
 * Regime Mapper Utility
 *
 * Maps Fear & Greed Index sentiment values (0-100) to market regime IDs.
 * Provides validation and helper functions for regime determination.
 */

import type { RegimeId } from "@/components/wallet/regime/regimeData";
import { logger } from "@/utils";

export const REGIME_LABELS: Record<RegimeId, string> = {
  ef: "Extreme Fear",
  f: "Fear",
  n: "Neutral",
  g: "Greed",
  eg: "Extreme Greed",
};

/**
 * Maps a sentiment value (0-100) to the corresponding market regime.
 *
 * Sentiment Ranges:
 * - Extreme Fear (ef): 0-25
 * - Fear (f): 26-45
 * - Neutral (n): 46-54
 * - Greed (g): 55-75
 * - Extreme Greed (eg): 76-100
 *
 * @param sentimentValue - Sentiment score from 0 (extreme fear) to 100 (extreme greed)
 * @returns RegimeId corresponding to the sentiment level
 *
 * @example
 * ```typescript
 * const regime = getRegimeFromSentiment(65); // returns "g" (Greed)
 * const extreme = getRegimeFromSentiment(90); // returns "eg" (Extreme Greed)
 * ```
 */
export function getRegimeFromSentiment(sentimentValue: number): RegimeId {
  // Validate input: reject NaN, Infinity, and out-of-range values
  if (
    !Number.isFinite(sentimentValue) ||
    sentimentValue < 0 ||
    sentimentValue > 100
  ) {
    logger.warn(
      `Invalid sentiment value: ${sentimentValue}. Defaulting to neutral regime.`,
      { sentimentValue },
      "regimeMapper"
    );
    return "n";
  }

  // Map sentiment to regime
  if (sentimentValue <= 25) return "ef"; // Extreme Fear: 0-25
  if (sentimentValue <= 45) return "f"; // Fear: 26-45
  if (sentimentValue <= 54) return "n"; // Neutral: 46-54
  if (sentimentValue <= 75) return "g"; // Greed: 55-75
  return "eg"; // Extreme Greed: 76-100
}

/**
 * Maps a sentiment status string to the corresponding market regime.
 *
 * @param status - The status string from the API (e.g. "Extreme Fear", "Neutral")
 * @returns RegimeId corresponding to the status
 */
export function getRegimeFromStatus(status?: string | null): RegimeId {
  if (!status) {
    return "n";
  }

  const normalizedStatus = status.toLowerCase().trim();

  switch (normalizedStatus) {
    case "extreme fear":
      return "ef";
    case "fear":
      return "f";
    case "neutral":
      return "n";
    case "greed":
      return "g";
    case "extreme greed":
      return "eg";
    default:
      logger.warn(
        `Unknown sentiment status: "${status}". Defaulting to neutral regime.`,
        { status },
        "regimeMapper"
      );
      return "n";
  }
}

// Unused exports removed: getRegimeLabelFromSentiment, isSentimentInRegime
