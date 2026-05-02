import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WriteResult } from '../../../../src/core/database/baseWriter.js';
import { MacroFearGreedFetcher } from '../../../../src/modules/macro-fear-greed/fetcher.js';
import { MacroFearGreedETLProcessor } from '../../../../src/modules/macro-fear-greed/processor.js';
import type { MacroFearGreedData } from '../../../../src/modules/macro-fear-greed/schema.js';
import { MacroFearGreedWriter } from '../../../../src/modules/macro-fear-greed/writer.js';
import type { MacroFearGreedSnapshotInsert } from '../../../../src/types/database.js';
import type { ETLJob } from '../../../../src/types/index.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

const macroData: MacroFearGreedData = {
  score: 62,
  label: 'greed',
  source: 'cnn_fear_greed_unofficial',
  updatedAt: '2026-04-29T00:00:00.000Z',
  rawRating: 'Greed',
  rawData: { score: 62 },
};

function createJob(overrides: Partial<ETLJob> = {}): ETLJob {
  return {
    jobId: 'macro-job-1',
    sources: ['macro-fear-greed'],
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    status: 'pending',
    ...overrides,
  };
}

function createWriteResult(overrides: Partial<WriteResult> = {}): WriteResult {
  return {
    success: true,
    recordsInserted: 1,
    errors: [],
    duplicatesSkipped: 0,
    ...overrides,
  };
}

describe('MacroFearGreedETLProcessor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('processes a fresh cached snapshot without calling CNN', async () => {
    const getLatestSpy = vi
      .spyOn(MacroFearGreedWriter.prototype, 'getLatestSnapshot')
      .mockResolvedValue(macroData);
    const fetchSpy = vi
      .spyOn(MacroFearGreedFetcher.prototype, 'fetchCurrent')
      .mockRejectedValue(new Error('should not fetch'));
    const writeSpy = vi
      .spyOn(MacroFearGreedWriter.prototype, 'writeSnapshots')
      .mockImplementation(async (snapshots: MacroFearGreedSnapshotInsert[]) =>
        createWriteResult({ recordsInserted: snapshots.length }),
      );

    const processor = new MacroFearGreedETLProcessor();
    const result = await processor.process(createJob());

    expect(result).toMatchObject({
      success: true,
      recordsProcessed: 1,
      recordsInserted: 1,
      source: 'macro-fear-greed',
    });
    expect(getLatestSpy).toHaveBeenCalledWith(21600);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        snapshot_date: '2026-04-29',
        score: 62,
      }),
    ]);
  });

  it('uses a stale database fallback when the live fetch fails', async () => {
    vi.spyOn(MacroFearGreedWriter.prototype, 'getLatestSnapshot')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(macroData);
    vi.spyOn(MacroFearGreedFetcher.prototype, 'fetchCurrent').mockRejectedValue(
      new Error('cnn unavailable'),
    );
    vi.spyOn(
      MacroFearGreedWriter.prototype,
      'writeSnapshots',
    ).mockResolvedValue(createWriteResult());

    const processor = new MacroFearGreedETLProcessor();
    const result = await processor.process(createJob());

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(1);
    expect(
      MacroFearGreedWriter.prototype.getLatestSnapshot,
    ).toHaveBeenCalledWith(259200);
  });

  it('returns a failed process result when fetch and fallback both fail', async () => {
    vi.spyOn(MacroFearGreedWriter.prototype, 'getLatestSnapshot')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.spyOn(MacroFearGreedFetcher.prototype, 'fetchCurrent').mockRejectedValue(
      new Error('cnn unavailable'),
    );
    const writeSpy = vi.spyOn(MacroFearGreedWriter.prototype, 'writeSnapshots');

    const processor = new MacroFearGreedETLProcessor();
    const result = await processor.process(createJob());

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['cnn unavailable']);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('backfills historical rows and reports requested, existing, fetched, and inserted counts', async () => {
    vi.spyOn(MacroFearGreedFetcher.prototype, 'fetchHistory').mockResolvedValue(
      [
        macroData,
        { ...macroData, updatedAt: '2026-04-30T00:00:00.000Z', score: 65 },
      ],
    );
    vi.spyOn(
      MacroFearGreedWriter.prototype,
      'writeSnapshots',
    ).mockResolvedValue(
      createWriteResult({ recordsInserted: 1, duplicatesSkipped: 1 }),
    );

    const processor = new MacroFearGreedETLProcessor();
    const result = await processor.backfillHistory('2026-04-01');

    expect(result).toEqual({
      requested: 2,
      existing: 1,
      fetched: 2,
      inserted: 1,
    });
  });

  it('throws when historical backfill writes fail', async () => {
    vi.spyOn(MacroFearGreedFetcher.prototype, 'fetchHistory').mockResolvedValue(
      [macroData],
    );
    vi.spyOn(
      MacroFearGreedWriter.prototype,
      'writeSnapshots',
    ).mockResolvedValue(
      createWriteResult({
        success: false,
        recordsInserted: 0,
        errors: ['db rejected row'],
      }),
    );

    const processor = new MacroFearGreedETLProcessor();

    await expect(processor.backfillHistory()).rejects.toThrow(
      'db rejected row',
    );
  });

  it('delegates health checks and exposes stats/source metadata', async () => {
    vi.spyOn(MacroFearGreedFetcher.prototype, 'healthCheck').mockResolvedValue({
      status: 'healthy',
      details: 'ok',
    });
    vi.spyOn(
      MacroFearGreedFetcher.prototype,
      'getRequestStats',
    ).mockReturnValue({
      requestCount: 3,
      lastRequestTime: 123,
    });

    const processor = new MacroFearGreedETLProcessor();

    await expect(processor.healthCheck()).resolves.toEqual({
      status: 'healthy',
      details: 'ok',
    });
    expect(processor.getStats()).toEqual({
      macroFearGreed: {
        requestCount: 3,
        lastRequestTime: 123,
      },
    });
    expect(processor.getSourceType()).toBe('macro-fear-greed');
  });
});
