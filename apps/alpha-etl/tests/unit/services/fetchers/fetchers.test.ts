import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseApiFetcher } from '../../../../src/core/fetchers/baseApiFetcher.js';
import { SupabaseFetcher } from '../../../../src/modules/vip-users/supabaseFetcher.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

class TestFetcher extends BaseApiFetcher {
  constructor() {
    super('test', 10);
  }

  getSourceType(): string {
    return 'test';
  }

  getStats(): Record<string, never> {
    return {};
  }

  async testGet(): Promise<unknown> {
    return this.fetchJson('/test');
  }

  async testPost(data: unknown): Promise<unknown> {
    return this.fetchJson('/test', {
      headers: { Method: 'POST' },
      body: JSON.stringify(data),
    });
  }

  async testFetchWithRetry<T>(url: string): Promise<T> {
    return this.fetchWithRetry<T>(url);
  }

  healthCheck(): Promise<{ status: 'healthy' }> {
    return Promise.resolve({ status: 'healthy' });
  }
}

describe('Fetchers', () => {
  describe('BaseApiFetcher', () => {
    let fetcher: TestFetcher;

    beforeEach(() => {
      fetcher = new TestFetcher();
      vi.clearAllMocks();
    });

    it('should handle network error in fetchJson', async () => {
      mockFetch.mockRejectedValue(new Error('Network Error'));

      await expect(fetcher.testGet()).rejects.toThrow('Network Error');
    });

    it('should handle non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetcher.testGet()).rejects.toThrow(
        '500 Internal Server Error',
      );
    });

    it('should handle fetchWithRetry default parameters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        headers: new Headers(),
      });
      global.fetch = mockFetch;

      const result = await fetcher.testFetchWithRetry(
        'https://api.example.com/test',
      );

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'alpha-etl/1.0.0',
            Accept: 'application/json',
          }),
        }),
      );
    });
  });

  describe('SupabaseFetcher', () => {
    let fetcher: SupabaseFetcher;

    beforeEach(() => {
      fetcher = new SupabaseFetcher();
    });

    it('should handle error in fetchVipUsersWithActivity', async () => {
      vi.spyOn(fetcher as unknown, 'withDatabaseClient').mockRejectedValue(
        new Error('DB Failed'),
      );

      await expect(fetcher.fetchVipUsersWithActivity()).rejects.toThrow(
        'DB fetch with activity failed: DB Failed',
      );
    });

    it('should handle error in batchUpdatePortfolioTimestamps', async () => {
      vi.spyOn(fetcher as unknown, 'withDatabaseClient').mockRejectedValue(
        new Error('Update Fail'),
      );

      await fetcher.batchUpdatePortfolioTimestamps(['0x123']);
    });
  });
});
