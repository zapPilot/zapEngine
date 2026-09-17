import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WriteResult } from '../../../../src/core/database/baseWriter.js';
import { MacroFearGreedFetcher } from '../../../../src/modules/macro-fear-greed/fetcher.js';
import { MacroFearGreedETLProcessor } from '../../../../src/modules/macro-fear-greed/processor.js';
import type { MacroFearGreedData } from '../../../../src/modules/macro-fear-greed/schema.js';
import { MacroFearGreedWriter } from '../../../../src/modules/macro-fear-greed/writer.js';

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

function writeResult(overrides: Partial<WriteResult> = {}): WriteResult {
  return {
    success: true,
    recordsInserted: 1,
    errors: [],
    ...overrides,
  };
}

describe('MacroFearGreedETLProcessor coverage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults existing count when the writer omits duplicatesSkipped', async () => {
    vi.spyOn(MacroFearGreedFetcher.prototype, 'fetchHistory').mockResolvedValue([
      macroData,
    ]);
    vi.spyOn(MacroFearGreedWriter.prototype, 'writeSnapshots').mockResolvedValue(
      writeResult(),
    );

    const result = await new MacroFearGreedETLProcessor().backfillHistory();

    expect(result).toEqual({
      requested: 1,
      existing: 0,
      fetched: 1,
      inserted: 1,
    });
  });

  it('uses the default write failure message when no writer error is supplied', async () => {
    vi.spyOn(MacroFearGreedFetcher.prototype, 'fetchHistory').mockResolvedValue([
      macroData,
    ]);
    vi.spyOn(MacroFearGreedWriter.prototype, 'writeSnapshots').mockResolvedValue(
      writeResult({ success: false, recordsInserted: 0, errors: [] }),
    );

    const processor = new MacroFearGreedETLProcessor();
    await expect(processor.backfillHistory()).rejects.toThrow(
      'Macro Fear & Greed backfill write failed',
    );
  });
});
