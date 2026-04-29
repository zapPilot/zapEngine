import { describe, expect, it } from 'vitest';

import {
  labelFromScore,
  parseCnnFearGreedHistory,
  parseCurrentCnnFearGreed,
} from '../../../../src/modules/macro-fear-greed/schema.js';

describe('CNN macro Fear & Greed parser', () => {
  it('parses the current payload shape', () => {
    const result = parseCurrentCnnFearGreed({
      fear_and_greed: {
        score: 72.4,
        rating: 'Greed',
        timestamp: 1777420800000,
      },
    });

    expect(result).toMatchObject({
      score: 72.4,
      normalizedScore: 72,
      label: 'greed',
      source: 'cnn_fear_greed_unofficial',
      rawRating: 'Greed',
    });
    expect(result.updatedAt).toBe('2026-04-29T00:00:00.000Z');
  });

  it('falls back to the latest historical row when current score is absent', () => {
    const result = parseCurrentCnnFearGreed({
      fear_and_greed: {},
      fear_and_greed_historical: {
        data: [
          { x: 1777334400000, y: 10, rating: 'Extreme Fear' },
          { x: 1777420800000, y: 80, rating: 'Extreme Greed' },
        ],
      },
    });

    expect(result.normalizedScore).toBe(80);
    expect(result.label).toBe('extreme_greed');
    expect(result.updatedAt).toBe('2026-04-29T00:00:00.000Z');
  });

  it('deduplicates historical rows by UTC date', () => {
    const result = parseCnnFearGreedHistory({
      fear_and_greed_historical: {
        data: [
          { x: 1777420800000, y: 60, rating: 'Greed' },
          { x: 1777424400000, y: 62, rating: 'Greed' },
        ],
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.normalizedScore).toBe(62);
  });

  it('uses score labels for unknown ratings and clamps score boundaries', () => {
    const result = parseCurrentCnnFearGreed({
      fear_and_greed: {
        score: 150,
        rating: 'Risk On',
        timestamp: 1777420800000,
      },
    });

    expect(result.score).toBe(100);
    expect(result.normalizedScore).toBe(100);
    expect(result.label).toBe('extreme_greed');
  });

  it('maps CNN score thresholds', () => {
    expect(labelFromScore(24)).toBe('extreme_fear');
    expect(labelFromScore(44)).toBe('fear');
    expect(labelFromScore(55)).toBe('neutral');
    expect(labelFromScore(75)).toBe('greed');
    expect(labelFromScore(76)).toBe('extreme_greed');
  });
});
