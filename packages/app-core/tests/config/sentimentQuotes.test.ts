import { afterEach, describe, expect, it, vi } from 'vitest';

import { getQuoteForSentiment } from '@core/config/sentimentQuotes';

describe('getQuoteForSentiment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the neutral default for non-finite values', () => {
    expect(getQuoteForSentiment(Number.NaN)).toMatchObject({
      sentiment: 'Neutral',
      author: 'Warren Buffett',
    });
    expect(getQuoteForSentiment(Number.POSITIVE_INFINITY).sentiment).toBe(
      'Neutral',
    );
  });

  it.each([
    [-10, 'Extreme Fear'],
    [0, 'Extreme Fear'],
    [24, 'Extreme Fear'],
    [25, 'Fear'],
    [44, 'Fear'],
    [45, 'Neutral'],
    [55, 'Neutral'],
    [56, 'Greed'],
    [74, 'Greed'],
    [75, 'Extreme Greed'],
    [100, 'Extreme Greed'],
    [150, 'Extreme Greed'],
  ] as const)(
    'maps %s into the %s bucket after clamping',
    (score, sentiment) => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      expect(getQuoteForSentiment(score).sentiment).toBe(sentiment);
    },
  );

  it('selects alternate quotes deterministically from Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const result = getQuoteForSentiment(30);
    expect(result.sentiment).toBe('Fear');
    expect(result.quote).toContain('realist');
  });

  it('falls back to the default quote if an out-of-range random index is produced', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    expect(getQuoteForSentiment(30)).toMatchObject({
      sentiment: 'Fear',
      quote: 'Stay balanced when the crowd swings too far in either direction.',
      author: 'Warren Buffett',
    });
  });
});
