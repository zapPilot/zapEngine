import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MacroFearGreedTransformer } from '../../../../src/modules/macro-fear-greed/transformer.js';
import type { MacroFearGreedData } from '../../../../src/modules/macro-fear-greed/schema.js';

describe('MacroFearGreedTransformer', () => {
  const input: MacroFearGreedData = {
    score: 72,
    label: 'greed',
    source: 'cnn_fear_greed_unofficial',
    updatedAt: '2026-04-29T00:00:00.000Z',
    rawRating: 'Greed',
    rawData: { fear_and_greed: { score: 72 } },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:34:56.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('transforms current macro data into a snapshot insert', () => {
    const transformer = new MacroFearGreedTransformer();

    const result = transformer.transform(input);

    expect(result).toEqual({
      snapshot_date: '2026-04-29',
      score: 72,
      label: 'greed',
      source: 'cnn_fear_greed_unofficial',
      provider_updated_at: '2026-04-29T00:00:00.000Z',
      raw_rating: 'Greed',
      raw_data: {
        original_data: input.rawData,
        transformed_at: '2026-05-01T12:34:56.000Z',
      },
    });
  });

  it('transforms a batch in order', () => {
    const transformer = new MacroFearGreedTransformer();

    const result = transformer.transformBatch([
      input,
      {
        ...input,
        score: 20,
        label: 'extreme_fear',
        updatedAt: '2026-04-30T00:00:00.000Z',
        rawRating: null,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.snapshot_date)).toEqual([
      '2026-04-29',
      '2026-04-30',
    ]);
    expect(result[1]).toMatchObject({
      score: 20,
      label: 'extreme_fear',
      raw_rating: null,
    });
  });
});
