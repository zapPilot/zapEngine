/**
 * Market Sentiment Service
 *
 * Fetches Fear & Greed Index data via backend proxy to avoid CORS issues.
 * Backend proxy caches data for 10 minutes to reduce load on external API.
 */

import {
  getQuoteForSentiment,
  type SentimentLabel,
} from '@/config/sentimentQuotes';
import { httpUtils } from '@/lib/http';
import { createApiServiceCaller } from '@/lib/http/createServiceCaller';
import {
  type SentimentApiResponse,
  validateSentimentApiResponse,
} from '@/schemas/api/sentimentSchemas';

/**
 * Frontend Data Model with quote integration
 */
export interface MarketSentimentData {
  value: number;
  status: SentimentLabel | string;
  timestamp: string;
  quote: {
    quote: string;
    author: string;
    sentiment: SentimentLabel;
  };
}

const callSentimentApi = createApiServiceCaller(
  {
    500: 'An unexpected error occurred while fetching sentiment data.',
    502: 'Invalid data received from sentiment provider.',
    503: 'Market sentiment data is temporarily unavailable. Please try again later.',
    504: 'Request timed out while fetching market sentiment.',
  },
  'Failed to fetch market sentiment',
);

/**
 * Transform backend response to frontend format with quote
 */
function transformSentimentData(
  response: SentimentApiResponse,
): MarketSentimentData {
  const quote = getQuoteForSentiment(response.value);

  return {
    value: response.value,
    status: response.status,
    timestamp: response.timestamp,
    quote,
  };
}

/**
 * Fetch market sentiment from backend proxy endpoint
 *
 * Calls `/api/v2/market/sentiment` which proxies the Fear & Greed Index API
 * to avoid CORS issues. Backend handles caching and error handling.
 *
 * @returns Market sentiment data with quote
 */
export async function fetchMarketSentiment(): Promise<MarketSentimentData> {
  return callSentimentApi(async () => {
    const response = await httpUtils.analyticsEngine.get(
      '/api/v2/market/sentiment',
    );

    const validatedResponse = validateSentimentApiResponse(response);
    return transformSentimentData(validatedResponse);
  });
}
