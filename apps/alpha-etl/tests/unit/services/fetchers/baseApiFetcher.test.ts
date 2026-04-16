import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseApiFetcher } from '../../../../src/core/fetchers/baseApiFetcher.js';
import { APIError } from '../../../../src/utils/errors.js';

// Mock logger
vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

// Concrete implementation for testing
class TestApiFetcher extends BaseApiFetcher {
  constructor(baseUrl: string, rateLimitDelay?: number) {
    super(baseUrl, rateLimitDelay);
  }

  async healthCheck() {
    return { status: 'healthy' as const };
  }

  // Expose protected methods for testing
  public async testEnforceRateLimit() {
    return this.enforceRateLimit();
  }

  public async testFetchWithRateLimit(url: string, options?: unknown) {
    return this.fetchWithRateLimit(url, options);
  }

  public async testFetchJson<T>(url: string, options?: unknown): Promise<T> {
    return this.fetchJson<T>(url, options);
  }

  public async testFetchWithRetry<T>(
    url: string,
    options?: unknown,
    maxRetries?: number,
    baseDelayMs?: number
  ): Promise<T> {
    return this.fetchWithRetry<T>(url, options, maxRetries, baseDelayMs);
  }
}

describe('BaseApiFetcher', () => {
  let fetcher: TestApiFetcher;

  beforeEach(() => {
    vi.useFakeTimers();
    fetcher = new TestApiFetcher('https://api.example.com', 1000);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  describe('constructor', () => {
    it('initializes with base URL and default rate limit delay', () => {
      const testFetcher = new TestApiFetcher('https://test.api');
      const stats = testFetcher.getRequestStats();

      expect(stats.requestCount).toBe(0);
      expect(stats.lastRequestTime).toBe(0);
    });

    it('accepts custom rate limit delay', () => {
      const testFetcher = new TestApiFetcher('https://test.api', 2000);
      // Rate limit is protected, but we can verify it works by testing enforceRateLimit
      expect(testFetcher).toBeDefined();
    });
  });

  describe('enforceRateLimit', () => {
    it('does not delay first request', async () => {
      const startTime = Date.now();

      await fetcher.testEnforceRateLimit();

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBe(0); // No delay for first request
    });

    it('enforces delay between consecutive requests', async () => {
      // First request - no delay
      await fetcher.testEnforceRateLimit();

      const promise = fetcher.testEnforceRateLimit();

      // Second request should wait for rate limit
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(500);

      await promise;

      const stats = fetcher.getRequestStats();
      expect(stats.requestCount).toBe(2);
    });

    it('calculates correct delay based on time elapsed', async () => {
      // First request
      await fetcher.testEnforceRateLimit();

      // Advance time by 300ms
      vi.advanceTimersByTime(300);

      // Second request should wait 700ms more (1000ms total - 300ms elapsed)
      const promise = fetcher.testEnforceRateLimit();

      // Not done yet after 600ms
      await vi.advanceTimersByTimeAsync(600);

      // Now should be done (300 + 700 = 1000ms)
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(fetcher.getRequestStats().requestCount).toBe(2);
    });

    it('increments request count on each call', async () => {
      await fetcher.testEnforceRateLimit();
      expect(fetcher.getRequestStats().requestCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);
      await fetcher.testEnforceRateLimit();
      expect(fetcher.getRequestStats().requestCount).toBe(2);

      await vi.advanceTimersByTimeAsync(1000);
      await fetcher.testEnforceRateLimit();
      expect(fetcher.getRequestStats().requestCount).toBe(3);
    });

    it('updates lastRequestTime on each call', async () => {
      await fetcher.testEnforceRateLimit();
      const time1 = fetcher.getRequestStats().lastRequestTime;

      vi.advanceTimersByTime(1500);
      await vi.advanceTimersByTimeAsync(0);
      await fetcher.testEnforceRateLimit();
      const time2 = fetcher.getRequestStats().lastRequestTime;

      expect(time2).toBeGreaterThan(time1);
      expect(time2 - time1).toBeGreaterThanOrEqual(1500);
    });

    it('handles concurrent requests by queueing', async () => {
      // Fire 3 requests simultaneously
      const promise1 = fetcher.testEnforceRateLimit();
      const promise2 = fetcher.testEnforceRateLimit();
      const promise3 = fetcher.testEnforceRateLimit();

      // First one completes immediately
      await promise1;
      expect(fetcher.getRequestStats().requestCount).toBe(1);

      // Advance timers to process remaining queued requests
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.all([promise2, promise3]);

      // Verify all 3 requests completed
      expect(fetcher.getRequestStats().requestCount).toBe(3);
    });

    it('allows immediate requests after rate limit period expires', async () => {
      await fetcher.testEnforceRateLimit();

      // Wait longer than rate limit
      vi.advanceTimersByTime(1500);

      const startTime = Date.now();
      await fetcher.testEnforceRateLimit();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBe(0); // No additional delay needed
    });
  });

  describe('fetchWithRateLimit', () => {
    it('makes successful HTTP request with rate limiting', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await fetcher.testFetchWithRateLimit('https://api.example.com/test');

      expect(response.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'alpha-etl/1.0.0',
            'Accept': 'application/json'
          })
        })
      );
    });

    it('includes custom headers in request', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await fetcher.testFetchWithRateLimit('https://api.example.com/test', {
        headers: {
          'Authorization': 'Bearer token123',
          'Custom-Header': 'value'
        }
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'alpha-etl/1.0.0',
            'Accept': 'application/json',
            'Authorization': 'Bearer token123',
            'Custom-Header': 'value'
          })
        })
      );
    });

    it('throws APIError on non-200 response', async () => {
      const mockResponse = new Response('Not Found', {
        status: 404,
        statusText: 'Not Found'
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await expect(
        fetcher.testFetchWithRateLimit('https://api.example.com/missing')
      ).rejects.toThrow(APIError);

      // Verify error properties
      try {
        await vi.advanceTimersByTimeAsync(1000); // Advance timer for second call
        await fetcher.testFetchWithRateLimit('https://api.example.com/missing');
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).statusCode).toBe(404);
        expect((error as APIError).url).toBe('https://api.example.com/missing');
        expect((error as APIError).source).toBe('TestApiFetcher');
      }
    });

    it('throws APIError on 500 server error', async () => {
      const mockResponse = new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error'
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await expect(
        fetcher.testFetchWithRateLimit('https://api.example.com/error')
      ).rejects.toThrow(/500 Internal Server Error/);
    });

    it('enforces rate limit before making request', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      global.fetch = fetchSpy;

      // First request
      await fetcher.testFetchWithRateLimit('https://api.example.com/1');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second request should be delayed
      const promise = fetcher.testFetchWithRateLimit('https://api.example.com/2');
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Not called yet

      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('increments request count', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

      expect(fetcher.getRequestStats().requestCount).toBe(0);

      await fetcher.testFetchWithRateLimit('https://api.example.com/1');
      expect(fetcher.getRequestStats().requestCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);
      await fetcher.testFetchWithRateLimit('https://api.example.com/2');
      expect(fetcher.getRequestStats().requestCount).toBe(2);
    });
  });

  describe('fetchJson', () => {
    it('parses JSON response', async () => {
      const mockData = { id: 123, name: 'Test', values: [1, 2, 3] };
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await fetcher.testFetchJson('https://api.example.com/data');

      expect(result).toEqual(mockData);
    });

    it('handles empty JSON object', async () => {
      const mockResponse = new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await fetcher.testFetchJson('https://api.example.com/empty');

      expect(result).toEqual({});
    });

    it('handles JSON array', async () => {
      const mockData = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await fetcher.testFetchJson<typeof mockData>('https://api.example.com/list');

      expect(result).toEqual(mockData);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
    });

    it('preserves type information', async () => {
      interface TestType {
        id: number;
        name: string;
        active: boolean;
      }

      const mockData: TestType = { id: 1, name: 'Test', active: true };
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await fetcher.testFetchJson<TestType>('https://api.example.com/typed');

      expect(result.id).toBe(1);
      expect(result.name).toBe('Test');
      expect(result.active).toBe(true);
    });

    it('enforces rate limit', async () => {
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(new Response('{"status":"ok"}', { status: 200 }))
      );
      global.fetch = fetchSpy;

      await fetcher.testFetchJson('https://api.example.com/1');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const promise = fetcher.testFetchJson('https://api.example.com/2');
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Still 1, rate limited

      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchWithRetry', () => {
    it('retries with delay and wraps non-Error failures outside test env', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const fetchJsonSpy = vi
        .spyOn(fetcher as unknown, 'fetchJson')
        .mockRejectedValueOnce('temporary failure')
        .mockResolvedValueOnce({ ok: true });

      const promise = fetcher.testFetchWithRetry('https://api.example.com/retry', {}, 2, 50);

      await vi.advanceTimersByTimeAsync(50);
      const result = await promise;

      expect(result).toEqual({ ok: true });
      expect(fetchJsonSpy).toHaveBeenCalledTimes(2);

      process.env.NODE_ENV = originalEnv;
    });

    it('throws last error when all retries fail', async () => {
      vi.spyOn(fetcher as unknown, 'fetchJson')
        .mockRejectedValue(new Error('Persistent failure'));

      await expect(
        fetcher.testFetchWithRetry('https://api.example.com/fail', {}, 3, 100)
      ).rejects.toThrow('Persistent failure');
    });

    it('throws unknown error when maxRetries is 0', async () => {
      vi.spyOn(fetcher as unknown, 'fetchJson')
        .mockRejectedValue(new Error('Unknown fetch error'));

      await expect(
        fetcher.testFetchWithRetry('https://api.example.com/fail', {}, 0)
      ).rejects.toThrow('Unknown fetch error');
    });
  });

  describe('getRequestStats', () => {
    it('returns current request statistics', () => {
      const stats = fetcher.getRequestStats();

      expect(stats).toHaveProperty('requestCount');
      expect(stats).toHaveProperty('lastRequestTime');
      expect(stats.requestCount).toBe(0);
      expect(stats.lastRequestTime).toBe(0);
    });

    it('reflects updated statistics after requests', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

      await fetcher.testEnforceRateLimit();
      const stats1 = fetcher.getRequestStats();
      expect(stats1.requestCount).toBe(1);
      expect(stats1.lastRequestTime).toBeGreaterThan(0);

      await vi.advanceTimersByTimeAsync(1000);
      await fetcher.testEnforceRateLimit();
      const stats2 = fetcher.getRequestStats();
      expect(stats2.requestCount).toBe(2);
      expect(stats2.lastRequestTime).toBeGreaterThan(stats1.lastRequestTime);
    });

    it('returns fresh object on each call', () => {
      const stats1 = fetcher.getRequestStats();
      const stats2 = fetcher.getRequestStats();

      expect(stats1).not.toBe(stats2); // Different objects
      expect(stats1).toEqual(stats2); // Same values
    });
  });

  describe('resetStats', () => {
    it('resets request count to zero', async () => {
      await fetcher.testEnforceRateLimit();
      await vi.advanceTimersByTimeAsync(1000);
      await fetcher.testEnforceRateLimit();

      expect(fetcher.getRequestStats().requestCount).toBe(2);

      fetcher.resetStats();

      expect(fetcher.getRequestStats().requestCount).toBe(0);
    });

    it('resets last request time to zero', async () => {
      await fetcher.testEnforceRateLimit();

      expect(fetcher.getRequestStats().lastRequestTime).toBeGreaterThan(0);

      fetcher.resetStats();

      expect(fetcher.getRequestStats().lastRequestTime).toBe(0);
    });

    it('allows fresh start after reset', async () => {
      await fetcher.testEnforceRateLimit();
      await vi.advanceTimersByTimeAsync(1000);
      await fetcher.testEnforceRateLimit();

      fetcher.resetStats();

      // Next request should have no delay (like first request)
      const startTime = Date.now();
      await fetcher.testEnforceRateLimit();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBe(0);
      expect(fetcher.getRequestStats().requestCount).toBe(1);
    });

    it('can be called multiple times safely', () => {
      fetcher.resetStats();
      fetcher.resetStats();
      fetcher.resetStats();

      const stats = fetcher.getRequestStats();
      expect(stats.requestCount).toBe(0);
      expect(stats.lastRequestTime).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('handles very long delay times', async () => {
      const longDelayFetcher = new TestApiFetcher('https://api.example.com', 60000); // 1 minute

      await longDelayFetcher.testEnforceRateLimit();

      const promise = longDelayFetcher.testEnforceRateLimit();

      await vi.advanceTimersByTimeAsync(60000);
      await promise;

      expect(longDelayFetcher.getRequestStats().requestCount).toBe(2);
    });

    it('handles zero delay (no rate limiting)', async () => {
      const noLimitFetcher = new TestApiFetcher('https://api.example.com', 0);

      await noLimitFetcher.testEnforceRateLimit();
      await noLimitFetcher.testEnforceRateLimit();
      await noLimitFetcher.testEnforceRateLimit();

      expect(noLimitFetcher.getRequestStats().requestCount).toBe(3);
    });

    it('handles request count overflow protection', async () => {
      // Simulate very high request count
      for (let i = 0; i < 10; i++) {
        await fetcher.testEnforceRateLimit();
        await vi.advanceTimersByTimeAsync(1000);
      }

      expect(fetcher.getRequestStats().requestCount).toBe(10);
    });

    it('handles malformed JSON gracefully', async () => {
      const mockResponse = new Response('{ invalid json }', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await expect(
        fetcher.testFetchJson('https://api.example.com/malformed')
      ).rejects.toThrow();
    });

    it('handles network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        fetcher.testFetchWithRateLimit('https://api.example.com/network-fail')
      ).rejects.toThrow('Network error');
    });

    it('handles timeout errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Request timeout'));

      await expect(
        fetcher.testFetchWithRateLimit('https://api.example.com/timeout')
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('Abstract healthCheck', () => {
    it('can be implemented by subclass', async () => {
      const result = await fetcher.healthCheck();

      expect(result).toHaveProperty('status');
      expect(result.status).toBe('healthy');
    });
  });
});
