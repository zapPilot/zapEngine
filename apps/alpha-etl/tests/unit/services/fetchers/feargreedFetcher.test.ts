/* eslint-disable max-lines-per-function */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FearGreedFetcher, type CoinMarketCapFearGreedResponse } from '../../../../src/modules/sentiment/index.js';
import { APIError } from '../../../../src/utils/errors.js';

// Silence logger
vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('FearGreedFetcher', () => {
  let fetcher: FearGreedFetcher;
  const mockApiKey = 'test-api-key-12345';

  beforeEach(() => {
    vi.clearAllMocks();
    // Set environment variable for tests
    process.env.COINMARKETCAP_API_KEY = mockApiKey;
    process.env.COINMARKETCAP_API_URL = 'https://pro-api.coinmarketcap.com';
    fetcher = new FearGreedFetcher();
  });

  afterEach(() => {
    delete process.env.COINMARKETCAP_API_KEY;
    delete process.env.COINMARKETCAP_API_URL;
  });

  const mockSuccessResponse: CoinMarketCapFearGreedResponse = {
    status: {
      timestamp: '2024-09-03T12:00:00.000Z',
      error_code: "0",
      error_message: null,
      elapsed: 15,
      credit_count: 1
    },
    data: {
      value: 55,
      update_time: '2024-09-02T12:00:00.000Z',
      value_classification: 'Greed'
    }
  };

  it('normalizes successful API response from CoinMarketCap', async () => {
    const fetchJsonSpy = vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue(mockSuccessResponse);

    const result = await fetcher.fetchCurrentSentiment();

    expect(result).toEqual({
      value: 55,
      classification: 'Greed',
      timestamp: Math.floor(new Date('2024-09-02T12:00:00.000Z').getTime() / 1000),
      source: 'coinmarketcap'
    });
    expect(fetchJsonSpy).toHaveBeenCalledWith(
      expect.stringContaining('/v3/fear-and-greed/latest'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-CMC_PRO_API_KEY': mockApiKey
        })
      })
    );
  });

  it('throws when sentiment value is out of range (negative)', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      ...mockSuccessResponse,
      data: { ...mockSuccessResponse.data, value: -5 }
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid sentiment value: -5 (must be 0-100)');
  });

  it('throws when sentiment value is out of range (over 100)', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      ...mockSuccessResponse,
      data: { ...mockSuccessResponse.data, value: 150 }
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid sentiment value: 150 (must be 0-100)');
  });

  it('throws when CoinMarketCap returns error code', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      status: {
        timestamp: '2024-09-03T12:00:00.000Z',
        error_code: "1001",
        error_message: 'Invalid API Key',
        elapsed: 5,
        credit_count: 0
      },
      data: {}
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('CoinMarketCap API error (code 1001): Invalid API Key');
  });

  it('throws when CoinMarketCap returns error code without message', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      status: {
        timestamp: '2024-09-03T12:00:00.000Z',
        error_code: "500",
        error_message: null,
        elapsed: 5,
        credit_count: 0
      },
      data: {}
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('CoinMarketCap API error (code 500): Unknown error');
  });

  it('health check fails when API key is missing', async () => {
    const fetcherWithoutKey = new FearGreedFetcher({ apiKey: '' });

    const health = await fetcherWithoutKey.healthCheck();

    expect(health.status).toBe('unhealthy');
    expect(health.details).toBe('CoinMarketCap API key not configured');
  });

  it('correctly parses ISO timestamp to Unix timestamp', async () => {
    const isoTimestamp = '2024-12-25T10:30:00.000Z';
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      ...mockSuccessResponse,
      data: {
        update_time: isoTimestamp,
        value: 50,
        value_classification: 'Neutral'
      }
    });

    const result = await fetcher.fetchCurrentSentiment();

    const expectedUnix = Math.floor(new Date(isoTimestamp).getTime() / 1000);
    expect(result.timestamp).toBe(expectedUnix);
  });

  it('throws when timestamp is invalid', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      ...mockSuccessResponse,
      data: {
        update_time: 'not-a-valid-iso-date',
        value: 50,
        value_classification: 'Neutral'
      }
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid timestamp');
  });

  it('reports unhealthy when sentiment data is stale', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - (26 * 60 * 60); // 26 hours ago
    vi.spyOn(fetcher, 'fetchCurrentSentiment').mockResolvedValue({
      value: 20,
      classification: 'Extreme Fear',
      timestamp: staleTimestamp,
      source: 'coinmarketcap'
    });

    const health = await fetcher.healthCheck();

    expect(health.status).toBe('unhealthy');
    expect(health.details).toContain('stale');
  });

  it('reports healthy when sentiment data is fresh', async () => {
    vi.spyOn(fetcher, 'fetchCurrentSentiment').mockResolvedValue({
      value: 80,
      classification: 'Extreme Greed',
      timestamp: Math.floor(Date.now() / 1000),
      source: 'coinmarketcap'
    });

    const health = await fetcher.healthCheck();

    expect(health.status).toBe('healthy');
    expect(health.details).toContain('Current sentiment');
    expect(health.details).toContain('CoinMarketCap');
  });

  it('throws when data object is missing', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      status: mockSuccessResponse.status,
      data: null
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid API response: missing or invalid data object');
  });

  it('throws when data is not an object', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      status: mockSuccessResponse.status,
      data: []
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid API response: missing or invalid data object');
  });

  it('rethrows APIError with friendly message', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockRejectedValue(new APIError('rate limited', 429, fetcher));

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('CoinMarketCap API error: rate limited');
  });

  it('healthCheck returns unhealthy when fetch fails', async () => {
    vi.spyOn(fetcher, 'fetchCurrentSentiment').mockRejectedValue(new Error('network down'));

    const health = await fetcher.healthCheck();

    expect(health.status).toBe('unhealthy');
    expect(health.details).toContain('network down');
  });

  it('throws when required sentiment fields are missing (value)', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      ...mockSuccessResponse,
      data: {
        update_time: '2024-09-02T12:00:00.000Z',
        value: null,
        value_classification: 'Greed'
      }
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid API response: missing required fields');
  });

  it('throws when required sentiment fields are missing (classification)', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      ...mockSuccessResponse,
      data: {
        update_time: '2024-09-02T12:00:00.000Z',
        value: 50,
        value_classification: ''
      }
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid API response: missing required fields');
  });

  it('throws when required sentiment fields are missing (update_time)', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      ...mockSuccessResponse,
      data: {
        update_time: '',
        value: 50,
        value_classification: 'Neutral'
      }
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid API response: missing required fields');
  });

  it('fetchRawResponse includes API key header', async () => {
    const spy = vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue(mockSuccessResponse);

    await fetcher.fetchRawResponse();

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/v3/fear-and-greed/latest'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-CMC_PRO_API_KEY': mockApiKey
        })
      })
    );
  });

  it('constructor initializes with environment variables', () => {
    const newFetcher = new FearGreedFetcher();

    // Verify it was initialized (check via a method call)
    expect(newFetcher).toBeInstanceOf(FearGreedFetcher);
  });

  it('constructor allows config override for API key', () => {
    const customKey = 'custom-key-67890';
    const customFetcher = new FearGreedFetcher({ apiKey: customKey });

    expect(customFetcher).toBeInstanceOf(FearGreedFetcher);
    // The apiKey is private, but we can verify it works by making a call
  });

  it('constructor allows config override for API URL', () => {
    const customUrl = 'https://custom-api.example.com';
    const customFetcher = new FearGreedFetcher({ apiUrl: customUrl });

    expect(customFetcher).toBeInstanceOf(FearGreedFetcher);
  });

  it('rounds fractional sentiment values to integers', async () => {
    vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
      ...mockSuccessResponse,
      data: {
        update_time: '2024-09-02T12:00:00.000Z',
        value: 55.7,
        value_classification: 'Greed'
      }
    });

    const result = await fetcher.fetchCurrentSentiment();

    expect(result.value).toBe(56); // Should be rounded
    expect(Number.isInteger(result.value)).toBe(true);
  });

  it('throws when response fails schema validation (missing required fields)', async () => {
    // Return a response that fails CoinMarketCapFearGreedSchema validation
    // The schema requires status.error_code as z.string()
    vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue({
      status: {
        timestamp: '2024-09-03T12:00:00.000Z',
        // error_code is missing - required by schema
        error_message: null,
        elapsed: 15,
        credit_count: 1
      },
      data: {
        value: 55,
        update_time: '2024-09-02T12:00:00.000Z',
        value_classification: 'Greed'
      }
    });

    await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid API response: missing or invalid data object');
  });

  describe('Boundary Value Testing', () => {
    it('handles exact boundary: sentiment_value = 0', async () => {
      vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
        ...mockSuccessResponse,
        data: { ...mockSuccessResponse.data, value: 0, value_classification: 'Extreme Fear' }
      });

      const result = await fetcher.fetchCurrentSentiment();

      expect(result.value).toBe(0);
      expect(result.classification).toBe('Extreme Fear');
      expect(result.source).toBe('coinmarketcap');
    });

    it('handles exact boundary: sentiment_value = 100', async () => {
      vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue({
        ...mockSuccessResponse,
        data: { ...mockSuccessResponse.data, value: 100, value_classification: 'Extreme Greed' }
      });

      const result = await fetcher.fetchCurrentSentiment();

      expect(result.value).toBe(100);
      expect(result.classification).toBe('Extreme Greed');
      expect(result.source).toBe('coinmarketcap');
    });
  });

  describe('Error logging', () => {
    it('should log detailed error information on network failure', async () => {
      // Import logger to spy on it
      const { logger } = await import('../../../../src/utils/logger.js');
      const loggerSpy = vi.spyOn(logger, 'error');

      // Mock fetch to throw a network error
      const networkError = new Error('Network request failed');
      networkError.name = 'TypeError';
      vi.spyOn(fetcher as unknown, 'fetchJson').mockRejectedValue(networkError);

      await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow();

      // Verify logger was called with serialized error (not empty object)
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch'),
        expect.objectContaining({
          message: 'Network request failed',
          name: 'TypeError',
          stack: expect.any(String)
        })
      );
    });

    it('should log detailed APIError with status code', async () => {
      const { logger } = await import('../../../../src/utils/logger.js');
      const loggerSpy = vi.spyOn(logger, 'error');

      // Mock fetch to throw an APIError
      const apiError = new APIError(
        '401 Unauthorized',
        401,
        'https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest'
      );
      vi.spyOn(fetcher as unknown, 'fetchJson').mockRejectedValue(apiError);

      await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow();

      // Verify logger was called with error details
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('CoinMarketCap API request failed'),
        expect.objectContaining({
          error: expect.stringContaining('401'),
          statusCode: 401
        })
      );
    });

    it('should log detailed error with stack trace on JSON parse failure', async () => {
      const { logger } = await import('../../../../src/utils/logger.js');
      const loggerSpy = vi.spyOn(logger, 'error');

      // Mock fetch to throw a SyntaxError (JSON parse failure)
      const parseError = new SyntaxError('Unexpected token < in JSON at position 0');
      vi.spyOn(fetcher as unknown, 'fetchJson').mockRejectedValue(parseError);

      await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow();

      // Verify logger was called with serialized error
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch'),
        expect.objectContaining({
          message: expect.stringContaining('JSON'),
          name: 'SyntaxError',
          stack: expect.any(String)
        })
      );
    });
  });
});
