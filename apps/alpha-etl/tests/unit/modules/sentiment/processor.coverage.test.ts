import { describe, expect, it } from 'vitest';

import { SentimentETLProcessor } from '../../../../src/modules/sentiment/processor.js';

describe('SentimentETLProcessor coverage', () => {
  it('returns an empty batch when there is no raw sentiment record', async () => {
    const processor = new SentimentETLProcessor({ apiKey: 'test' });
    const transformSentiment = Reflect.get(processor, 'transformSentiment') as (
      rawData: [],
      jobId: string,
    ) => Promise<unknown[]>;

    await expect(
      transformSentiment.call(processor, [], 'coverage-empty-sentiment'),
    ).resolves.toEqual([]);
  });
});
