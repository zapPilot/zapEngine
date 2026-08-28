import {
  getDefaultQuoteForRegime,
  getRegimeFromStatus,
} from '@core/lib/domain/regime';
import type { RegimeId } from '@core/regime/regimeData';
import type { MarketSentimentData } from '@core/services';

export interface SentimentInfo {
  value: number;
  status: string;
  quote: string;
  regime: RegimeId;
}

/**
 * Transforms sentiment data into consumption-ready format
 */
export function processSentimentData(
  sentimentData: MarketSentimentData | null,
): SentimentInfo {
  const value = sentimentData?.value ?? 50;
  const status = sentimentData?.status ?? 'Neutral';
  const regime = getRegimeFromStatus(status);

  return {
    value,
    status,
    quote: sentimentData?.quote?.quote ?? getDefaultQuoteForRegime(regime),
    regime,
  };
}
