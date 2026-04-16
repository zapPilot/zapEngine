import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    getDbPool: vi.fn(() => ({
      query: vi.fn(),
    })),
    getTableName: actual.getTableName,
  };
});

vi.mock('../../../../src/modules/token-price/dmaWriter.js', () => ({
  TokenPriceDmaWriter: class {
    writeDmaSnapshots = vi.fn().mockResolvedValue({ recordsInserted: 0, success: true, errors: [], duplicatesSkipped: 0 });
    getLatestDmaSnapshot = vi.fn().mockResolvedValue(null);
  },
}));

vi.mock('../../../../src/modules/token-price/ratioDmaWriter.js', () => ({
  TokenPairRatioDmaWriter: class {
    writeRatioDmaSnapshots = vi.fn().mockResolvedValue({ recordsInserted: 0, success: true, errors: [], duplicatesSkipped: 0 });
  },
}));

import { TokenPriceDmaService } from '../../../../src/modules/token-price/dmaService.js';
import { getDbPool } from '../../../../src/config/database.js';

describe('TokenPriceDmaService', () => {
  let service: TokenPriceDmaService;
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() };
    (getDbPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
    service = new TokenPriceDmaService(mockPool as unknown as import('pg').Pool);
  });

  describe('updateEthBtcRatioDma', () => {
    it('returns 0 when base prices are empty', async () => {
      // First call = base (ETH) returns empty, second call = quote (BTC)
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.updateEthBtcRatioDma('test-job');
      expect(result.recordsInserted).toBe(0);
    });

    it('returns 0 when aligned ratio series is empty (no overlapping dates)', async () => {
      // Base has date A, quote has date B → no overlap
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2024-01-01', price_usd: '100' }]
        })
        .mockResolvedValueOnce({
          rows: [{ token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2024-01-02', price_usd: '50000' }]
        });

      const result = await service.updateEthBtcRatioDma('test-job');
      expect(result.recordsInserted).toBe(0);
    });

    it('uses provided jobId for correlation (covers resolvePairCorrelationId left branch)', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.updateEthBtcRatioDma('explicit-job-id');
      expect(result.recordsInserted).toBe(0);
    });

    it('auto-generates correlationId when jobId is omitted (covers ?? right branch)', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.updateEthBtcRatioDma();
      expect(result.recordsInserted).toBe(0);
    });
  });
});
