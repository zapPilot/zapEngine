import { describe, expect, it } from 'vitest';

import {
  labelFromScore,
  msToIso,
  normalizeMacroFearGreedLabel,
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

    expect(result.score).toBe(80);
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
    expect(result[0]?.score).toBe(62);
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
    expect(result.label).toBe('extreme_greed');
  });

  it('uses score-derived labels when the raw rating is absent or unknown', () => {
    expect(normalizeMacroFearGreedLabel(null, 5)).toBe('extreme_fear');
    expect(normalizeMacroFearGreedLabel(undefined, 48)).toBe('neutral');
    expect(normalizeMacroFearGreedLabel('Risk On', 72)).toBe('greed');
  });

  it('normalizes CNN rating punctuation and whitespace', () => {
    expect(normalizeMacroFearGreedLabel(' Extreme-Greed ', 80)).toBe(
      'extreme_greed',
    );
  });

  it('coerces millisecond timestamps and parsable date strings to ISO', () => {
    expect(msToIso('1777420800000')).toBe('2026-04-29T00:00:00.000Z');
    expect(msToIso('2026-04-30T12:00:00Z')).toBe('2026-04-30T12:00:00.000Z');
  });

  it('throws when neither current nor historical payloads contain a score', () => {
    expect(() =>
      parseCurrentCnnFearGreed({
        fear_and_greed: { rating: 'Neutral' },
        fear_and_greed_historical: {
          data: [
            { x: 'not-a-date', y: 50, rating: 'Neutral' },
            { x: 1777420800000, y: 'not-a-score', rating: 'Neutral' },
          ],
        },
      }),
    ).toThrow('CNN FGI payload missing score and historical data');
  });

  it('skips invalid historical rows and sorts valid rows ascending', () => {
    const result = parseCnnFearGreedHistory({
      fear_and_greed_historical: {
        data: [
          { x: 1777507200000, y: 70, rating: 'Greed' },
          { x: 'not-a-date', y: 65, rating: 'Greed' },
          { x: 1777420800000, y: null, rating: 'Neutral' },
          { x: 1777334400000, y: 10, rating: null },
        ],
      },
    });

    expect(result.map((row) => row.updatedAt)).toEqual([
      '2026-04-28T00:00:00.000Z',
      '2026-04-30T00:00:00.000Z',
    ]);
    expect(result[0]?.label).toBe('extreme_fear');
  });

  it('maps CNN score thresholds', () => {
    expect(labelFromScore(24)).toBe('extreme_fear');
    expect(labelFromScore(44)).toBe('fear');
    expect(labelFromScore(55)).toBe('neutral');
    expect(labelFromScore(75)).toBe('greed');
    expect(labelFromScore(76)).toBe('extreme_greed');
  });
});
