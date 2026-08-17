import { describe, expect, it } from 'vitest';

import { parseEpisodeSearchLimit } from './request-validation.js';

describe('parseEpisodeSearchLimit', () => {
  it('rejects non-string values instead of coercing them', () => {
    expect(() => parseEpisodeSearchLimit(10)).toThrow(
      'Search limit must be an integer from 1 to 50',
    );
  });
});
