import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoinMarketCapPriceFetcher } from '../../../../src/modules/token-price/coinMarketCapFetcher.js';

const tokens = [
  { tokenId: 'bitcoin', tokenSymbol: 'BTC', coinMarketCapId: 1 },
  { tokenId: 'ethereum', tokenSymbol: 'ETH', coinMarketCapId: 1027 },
];
const quote = {
  quote: { USD: { price: 60000, market_cap: 1000000, volume_24h: 1000 } },
};
const payload = { data: { '1': quote, '1027': quote } };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('CoinMarketCapPriceFetcher', () => {
  it('batches IDs, authenticates and normalizes the v2 response', async () => {
    vi.stubEnv('COINMARKETCAP_API_KEY', 'env-key');
    const fetcher = new CoinMarketCapPriceFetcher();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetcher.fetchCurrentPrices(tokens);
    expect(result).toEqual(
      tokens.map((token) => ({
        tokenId: token.tokenId,
        tokenSymbol: token.tokenSymbol,
        priceUsd: 60000,
        marketCapUsd: 1000000,
        volume24hUsd: 1000,
        timestamp: expect.any(Date),
        source: 'coinmarketcap',
      })),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/v2/cryptocurrency/quotes/latest?id=1,1027&convert=USD',
      ),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-CMC_PRO_API_KEY': 'env-key' }),
      }),
    );
  });

  it('rejects an incomplete batch', async () => {
    const fetcher = new CoinMarketCapPriceFetcher({
      apiKey: 'key',
      apiUrl: 'https://cmc.test',
    });
    vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue({
      data: { '1': quote },
    });
    await expect(fetcher.fetchCurrentPrices(tokens)).rejects.toThrow(
      'missing 1027 quote',
    );
  });

  it.each(['price', 'market_cap', 'volume_24h'])(
    'requires %s',
    async (field) => {
      const fetcher = new CoinMarketCapPriceFetcher({ apiKey: 'key' });
      const usd = { ...quote.quote.USD };
      delete usd[field];
      vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue({
        data: { '1': { quote: { USD: usd } } },
      });
      await expect(fetcher.fetchCurrentPrices(tokens)).rejects.toThrow();
    },
  );

  it('propagates non-2xx errors', async () => {
    const fetcher = new CoinMarketCapPriceFetcher({ apiKey: 'key' });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }),
    );
    vi.useFakeTimers();
    const assertion = expect(
      fetcher.fetchCurrentPrices(tokens),
    ).rejects.toThrow('403 Forbidden');
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });

  it('fails without a key before making a request', async () => {
    vi.stubEnv('COINMARKETCAP_API_KEY', '');
    const fetcher = new CoinMarketCapPriceFetcher();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetcher.fetchCurrentPrices(tokens)).rejects.toThrow(
      'API key not configured',
    );
    expect(await fetcher.healthCheck()).toMatchObject({ status: 'unhealthy' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports healthy after a valid quote', async () => {
    const fetcher = new CoinMarketCapPriceFetcher({ apiKey: 'key' });
    vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(payload);
    expect(await fetcher.healthCheck()).toEqual({ status: 'healthy' });
  });
});
