import { describe, expect, it } from 'vitest';

import { BaseApiFetcher } from '../../../../src/core/fetchers/baseApiFetcher.js';

class TestApiFetcher extends BaseApiFetcher {
  async healthCheck() {
    return { status: 'healthy' as const };
  }

  public normalizeError(error: unknown): Error {
    return this.toErrorObject(error);
  }
}

describe('BaseApiFetcher error normalization coverage', () => {
  it('wraps non-Error failures in an Error object', () => {
    const fetcher = new TestApiFetcher('https://api.example.com', 0);

    const error = fetcher.normalizeError('provider failure');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('provider failure');
  });
});
