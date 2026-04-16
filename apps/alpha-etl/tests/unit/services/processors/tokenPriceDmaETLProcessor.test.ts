import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  TokenPriceDmaService,
  buildAlignedPairRatioSeries,
  computeDma,
  computeTokenPairRatioDma
} from '../../../../src/modules/token-price/dmaService.js';
import { TokenPriceDmaWriter } from '../../../../src/modules/token-price/dmaWriter.js';
import { TokenPairRatioDmaWriter } from '../../../../src/modules/token-price/ratioDmaWriter.js';
import type { WriteResult } from '../../../../src/core/database/baseWriter.js';

function createWriteResult(recordsInserted: number): WriteResult {
  return {
    success: true,
    recordsInserted,
    duplicatesSkipped: 0,
    errors: []
  };
}

describe('TokenPriceDmaService', () => {
  let mockPool: Pool;

  beforeEach(() => {
    mockPool = {
      query: vi.fn()
    } as unknown as Pool;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use getDbPool fallback when no pool is provided', () => {
    // Constructing without pool exercises the pool ?? getDbPool() branch
    const fallbackService = new TokenPriceDmaService();
    expect(fallbackService).toBeDefined();
  });

  it('should compute DMA separately per token update call', async () => {
    const writeSpy = vi.spyOn(TokenPriceDmaWriter.prototype, 'writeDmaSnapshots')
      .mockImplementation(async (snapshots) => createWriteResult(snapshots.length));

    vi.mocked(mockPool.query).mockImplementation(async (_query, values) => {
      const tokenSymbol = values?.[1];

      if (tokenSymbol === 'BTC') {
        return {
          rows: [
            { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-06', price_usd: '100.00' },
            { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-07', price_usd: '105.00' }
          ]
        } as Awaited<ReturnType<Pool['query']>>;
      }

      return {
        rows: [
          { token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2026-02-06', price_usd: '200.00' },
          { token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2026-02-07', price_usd: '210.00' }
        ]
      } as Awaited<ReturnType<Pool['query']>>;
    });

    const service = new TokenPriceDmaService(mockPool);

    await service.updateDmaForToken('BTC', 'bitcoin', 'job-btc');
    await service.updateDmaForToken('ETH', 'ethereum', 'job-eth');

    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(writeSpy.mock.calls[0][0].every((row) => row.token_symbol === 'BTC')).toBe(true);
    expect(writeSpy.mock.calls[1][0].every((row) => row.token_symbol === 'ETH')).toBe(true);

    expect(mockPool.query).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      ['coingecko', 'BTC', 'bitcoin']
    );
    expect(mockPool.query).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      ['coingecko', 'ETH', 'ethereum']
    );
  });

  it('should return 0 records when no price history exists', async () => {
    vi.mocked(mockPool.query).mockResolvedValue({
      rows: []
    } as Awaited<ReturnType<Pool['query']>>);

    const service = new TokenPriceDmaService(mockPool);
    const result = await service.updateDmaForToken('UNKNOWN', 'unknown-token', 'job-empty');

    expect(result).toEqual({ recordsInserted: 0 });
  });

  it('should generate a correlation ID when no jobId is provided', async () => {
    const writeSpy = vi.spyOn(TokenPriceDmaWriter.prototype, 'writeDmaSnapshots')
      .mockImplementation(async (snapshots) => createWriteResult(snapshots.length));

    vi.mocked(mockPool.query).mockResolvedValue({
      rows: [
        { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-06', price_usd: '100.00' }
      ]
    } as Awaited<ReturnType<Pool['query']>>);

    const service = new TokenPriceDmaService(mockPool);
    await service.updateDmaForToken('BTC', 'bitcoin');

    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('should normalize token context (trim, uppercase symbol, lowercase id)', async () => {
    vi.spyOn(TokenPriceDmaWriter.prototype, 'writeDmaSnapshots')
      .mockImplementation(async (snapshots) => createWriteResult(snapshots.length));

    vi.mocked(mockPool.query).mockResolvedValue({
      rows: [
        { token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2026-02-06', price_usd: '3000.00' }
      ]
    } as Awaited<ReturnType<Pool['query']>>);

    const service = new TokenPriceDmaService(mockPool);
    await service.updateDmaForToken('  eth  ', '  Ethereum  ');

    // Verify the query used normalized values
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.any(String),
      ['coingecko', 'ETH', 'ethereum']
    );
  });

  it('should recompute and upsert all token dates so price changes are refreshed', async () => {
    let latestPrice = '100.00';

    const writeSpy = vi.spyOn(TokenPriceDmaWriter.prototype, 'writeDmaSnapshots')
      .mockImplementation(async (snapshots) => createWriteResult(snapshots.length));

    vi.mocked(mockPool.query).mockImplementation(async () => ({
      rows: [
        { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-06', price_usd: latestPrice }
      ]
    }) as Awaited<ReturnType<Pool['query']>>);

    const service = new TokenPriceDmaService(mockPool);

    await service.updateDmaForToken('BTC', 'bitcoin', 'job-one');
    latestPrice = '111.25';
    await service.updateDmaForToken('BTC', 'bitcoin', 'job-two');

    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(writeSpy.mock.calls[0][0][0].price_usd).toBe(100);
    expect(writeSpy.mock.calls[1][0][0].price_usd).toBe(111.25);
  });

  it('should compute ETH/BTC ratio snapshots only for overlapping dates', async () => {
    const ratioWriteSpy = vi.spyOn(TokenPairRatioDmaWriter.prototype, 'writeRatioDmaSnapshots')
      .mockImplementation(async (snapshots) => createWriteResult(snapshots.length));

    vi.mocked(mockPool.query).mockImplementation(async (_query, values) => {
      const tokenSymbol = values?.[1];

      if (tokenSymbol === 'ETH') {
        return {
          rows: [
            { token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2026-02-06', price_usd: '200.00' },
            { token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2026-02-07', price_usd: '210.00' },
            { token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2026-02-08', price_usd: '220.00' }
          ]
        } as Awaited<ReturnType<Pool['query']>>;
      }

      return {
        rows: [
          { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-07', price_usd: '10000.00' },
          { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-08', price_usd: '11000.00' }
        ]
      } as Awaited<ReturnType<Pool['query']>>;
    });

    const service = new TokenPriceDmaService(mockPool);
    const result = await service.updateEthBtcRatioDma('job-ratio');

    expect(result).toEqual({ recordsInserted: 2 });
    expect(ratioWriteSpy).toHaveBeenCalledTimes(1);

    const snapshots = ratioWriteSpy.mock.calls[0][0];
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].snapshot_date).toBe('2026-02-07');
    expect(snapshots[0].ratio_value).toBeCloseTo(210 / 10000);
    expect(snapshots[1].snapshot_date).toBe('2026-02-08');
    expect(snapshots[1].ratio_value).toBeCloseTo(220 / 11000);
  });
});

describe('computeDma', () => {
  it('should return null DMA when fewer rows than windowSize', () => {
    const prices = [
      { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-06', price_usd: 100 }
    ];

    const result = computeDma(prices, 2);

    expect(result).toHaveLength(1);
    expect(result[0].dma_200).toBeNull();
    expect(result[0].price_vs_dma_ratio).toBeNull();
    expect(result[0].is_above_dma).toBeNull();
    expect(result[0].days_available).toBe(1);
  });

  it('should compute DMA when rows >= windowSize', () => {
    const prices = [
      { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-06', price_usd: 100 },
      { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-07', price_usd: 200 },
      { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-08', price_usd: 300 }
    ];

    const result = computeDma(prices, 2);

    // First row: only 1 day available (< windowSize=2), so DMA is null
    expect(result[0].dma_200).toBeNull();
    expect(result[0].price_vs_dma_ratio).toBeNull();
    expect(result[0].is_above_dma).toBeNull();

    // Second row: 2 days available (= windowSize=2), DMA = (100 + 200) / 2 = 150
    expect(result[1].dma_200).toBe(150);
    expect(result[1].price_vs_dma_ratio).toBeCloseTo(200 / 150);
    expect(result[1].is_above_dma).toBe(true);

    // Third row: window = [200, 300], DMA = (200 + 300) / 2 = 250
    expect(result[2].dma_200).toBe(250);
    expect(result[2].price_vs_dma_ratio).toBeCloseTo(300 / 250);
    expect(result[2].is_above_dma).toBe(true);
  });

  it('should set is_above_dma to false when price equals or is below DMA', () => {
    const prices = [
      { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-06', price_usd: 100 },
      { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-07', price_usd: 100 }
    ];

    const result = computeDma(prices, 2);

    // DMA = (100 + 100) / 2 = 100, price = 100 → not above DMA
    expect(result[1].dma_200).toBe(100);
    expect(result[1].price_vs_dma_ratio).toBe(1);
    expect(result[1].is_above_dma).toBe(false);
  });

  it('should use default windowSize of 200 when not specified', () => {
    // With fewer than 200 rows, all DMA values should be null
    const prices = Array.from({ length: 5 }, (_, i) => ({
      token_symbol: 'BTC',
      token_id: 'bitcoin',
      snapshot_date: `2026-02-0${i + 1}`,
      price_usd: 100 + i
    }));

    const result = computeDma(prices);

    expect(result).toHaveLength(5);
    result.forEach((row) => {
      expect(row.dma_200).toBeNull();
    });
  });

  it('should include source and snapshot_time fields', () => {
    const prices = [
      { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-06', price_usd: 100 }
    ];

    const result = computeDma(prices, 1);

    expect(result[0].source).toBe('coingecko');
    expect(result[0].snapshot_time).toBeDefined();
    expect(result[0].token_symbol).toBe('BTC');
    expect(result[0].token_id).toBe('bitcoin');
  });
});

describe('buildAlignedPairRatioSeries', () => {
  it('should align base and quote prices by overlapping snapshot_date only', () => {
    const ratios = buildAlignedPairRatioSeries(
      [
        { token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2026-02-06', price_usd: 2000 },
        { token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2026-02-07', price_usd: 2100 },
        { token_symbol: 'ETH', token_id: 'ethereum', snapshot_date: '2026-02-08', price_usd: 2200 }
      ],
      [
        { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-07', price_usd: 100000 },
        { token_symbol: 'BTC', token_id: 'bitcoin', snapshot_date: '2026-02-08', price_usd: 110000 }
      ]
    );

    expect(ratios).toHaveLength(2);
    expect(ratios.map((row) => row.snapshot_date)).toEqual(['2026-02-07', '2026-02-08']);
    expect(ratios[0].ratio_value).toBeCloseTo(2100 / 100000);
    expect(ratios[1].ratio_value).toBeCloseTo(2200 / 110000);
  });
});

describe('computeTokenPairRatioDma', () => {
  it('should compute ratio DMA and flags when overlapping rows meet the window size', () => {
    const result = computeTokenPairRatioDma(
      [
        {
          base_token_symbol: 'ETH',
          base_token_id: 'ethereum',
          quote_token_symbol: 'BTC',
          quote_token_id: 'bitcoin',
          snapshot_date: '2026-02-06',
          ratio_value: 0.02
        },
        {
          base_token_symbol: 'ETH',
          base_token_id: 'ethereum',
          quote_token_symbol: 'BTC',
          quote_token_id: 'bitcoin',
          snapshot_date: '2026-02-07',
          ratio_value: 0.03
        },
        {
          base_token_symbol: 'ETH',
          base_token_id: 'ethereum',
          quote_token_symbol: 'BTC',
          quote_token_id: 'bitcoin',
          snapshot_date: '2026-02-08',
          ratio_value: 0.025
        }
      ],
      2
    );

    expect(result[0].dma_200).toBeNull();
    expect(result[1].dma_200).toBeCloseTo(0.025);
    expect(result[1].ratio_vs_dma_ratio).toBeCloseTo(0.03 / 0.025);
    expect(result[1].is_above_dma).toBe(true);
    expect(result[2].dma_200).toBeCloseTo(0.0275);
    expect(result[2].ratio_vs_dma_ratio).toBeCloseTo(0.025 / 0.0275);
    expect(result[2].is_above_dma).toBe(false);
  });
});
