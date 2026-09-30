import { logger } from '../../utils/logger.js';

export function resolveCoinMarketCapKey(
  fetcherName: string,
  configuredKey?: string,
): string {
  const apiKey = configuredKey ?? process.env['COINMARKETCAP_API_KEY'] ?? '';
  if (!apiKey) {
    logger.warn(
      `${fetcherName} initialized without API key - requests will fail`,
    );
  } else {
    logger.info(`${fetcherName} initialized with CoinMarketCap API key`);
  }
  return apiKey;
}

export function buildCoinMarketCapHeaders(
  apiKey: string,
): Record<string, string> {
  return { 'X-CMC_PRO_API_KEY': apiKey, Accept: 'application/json' };
}
