import {
  type CoinMarketCapFearGreedData,
  type CoinMarketCapFearGreedResponse,
  CoinMarketCapFearGreedSchema,
  type SentimentData,
} from '../../modules/sentiment/schema.js';

interface ValidSentimentEntry {
  value: number;
  update_time: string;
  value_classification: string;
}

function validateApiStatus(response: CoinMarketCapFearGreedResponse): void {
  if (response.status.error_code !== '0') {
    throw new Error(
      `CoinMarketCap API error (code ${response.status.error_code}): ${response.status.error_message ?? 'Unknown error'}`,
    );
  }
}

function extractDataEntry(
  response: CoinMarketCapFearGreedResponse,
): CoinMarketCapFearGreedData {
  if (
    !response.data ||
    typeof response.data !== 'object' ||
    Array.isArray(response.data)
  ) {
    throw new Error('Invalid API response: missing or invalid data object');
  }

  return response.data;
}

function validateRequiredSentimentFields(
  entry: CoinMarketCapFearGreedData,
): asserts entry is ValidSentimentEntry {
  if (
    entry.value === undefined ||
    entry.value === null ||
    !entry.value_classification ||
    !entry.update_time
  ) {
    throw new Error(
      'Invalid API response: missing required fields (value, value_classification, or update_time)',
    );
  }
}

function validateSentimentRange(value: number): void {
  if (value < 0 || value > 100) {
    throw new Error(`Invalid sentiment value: ${value} (must be 0-100)`);
  }
}

export function validateAndExtractSentimentEntry(
  response: CoinMarketCapFearGreedResponse,
): ValidSentimentEntry {
  const parsed = CoinMarketCapFearGreedSchema.safeParse(response);
  if (!parsed.success) {
    throw new Error('Invalid API response: missing or invalid data object');
  }

  validateApiStatus(response);
  const entry = extractDataEntry(response);
  validateRequiredSentimentFields(entry);
  validateSentimentRange(entry.value);
  return entry;
}

export function parseSentimentTimestamp(updateTime: string): number {
  const timestamp = Math.floor(new Date(updateTime).getTime() / 1000);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid timestamp: ${updateTime}`);
  }

  return timestamp;
}

export function normalizeSentimentData(
  sentimentEntry: ValidSentimentEntry,
  sourceName: string,
): SentimentData {
  const timestamp = parseSentimentTimestamp(sentimentEntry.update_time);
  return {
    value: Math.round(sentimentEntry.value),
    classification: sentimentEntry.value_classification,
    timestamp,
    source: sourceName,
  };
}
