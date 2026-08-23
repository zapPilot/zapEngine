import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PortfolioItemWriter } from '../../../../src/modules/wallet/portfolioWriter.js';
import { SentimentWriter } from '../../../../src/modules/sentiment/writer.js';
import { TokenPriceWriter } from '../../../../src/modules/token-price/writer.js';
import { WalletBalanceWriter } from '../../../../src/modules/wallet/balanceWriter.js';

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    getDbClient: vi.fn(),
  };
});

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('Database Services', () => {
  let mockClient: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    const database = await import('../../../../src/config/database.js');
    (database.getDbClient as unknown).mockResolvedValue(mockClient);
  });

  describe('PortfolioItemWriter', () => {
    it('should handle database error in writeSnapshots', async () => {
      mockClient.query.mockRejectedValue(new Error('Write error'));
      const writer = new PortfolioItemWriter();

      const result = await writer.writeSnapshots(
        [
          {
            wallet: 'w1',
            id_raw: 'id1',
            snapshot_at: '2026-08-23T00:00:00Z',
          } as unknown,
        ],
        'debank',
      );
      expect(result.success).toBe(false);
      expect(result.errors[0]).toBe('Write error');
    });
  });

  describe('SentimentWriter', () => {
    it('should handle database error in writeSentimentSnapshots', async () => {
      mockClient.query.mockRejectedValue(new Error('Write error'));
      const writer = new SentimentWriter();

      const result = await writer.writeSentimentSnapshots(
        [{ source: 's', classification: 'c', sentiment_value: 50 } as unknown],
        'source',
      );
      expect(result.success).toBe(false);
      expect(result.errors[0]).toBe('Write error');
    });
  });

  describe('TokenPriceWriter', () => {
    it('should handle error in insertBatch', async () => {
      const writer = new TokenPriceWriter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => {
          return (fn as (client: unknown) => Promise<unknown>)({
            query: mockClient.query,
          });
        },
      );
      mockClient.query.mockRejectedValue(new Error('Insert error'));

      await expect(
        writer.insertBatch([
          {
            timestamp: new Date(),
            priceUsd: 100,
            marketCapUsd: 1000,
            volume24hUsd: 500,
            source: 'coingecko',
            tokenSymbol: 'TEST',
            tokenId: 'test',
          },
        ]),
      ).rejects.toThrow('Insert error');
    });
  });

  describe('WalletBalanceWriter', () => {
    it('should handle database error in writeWalletBalanceSnapshots', async () => {
      mockClient.query.mockRejectedValue(new Error('Write error'));
      const writer = new WalletBalanceWriter();

      const result = await writer.writeWalletBalanceSnapshots([
        {
          user_wallet_address: 'w1',
          token_address: 't1',
          chain: 'eth',
          is_wallet: true,
          inserted_at: '2026-08-23',
        },
      ]);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
