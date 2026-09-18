import { describe, expect, it } from 'vitest';

import { parseCurrentCnnFearGreed } from '../../../../src/modules/macro-fear-greed/schema.js';

describe('macro-fear-greed schema coverage', () => {
  it('throws when current and historical payloads are both absent', () => {
    expect(() =>
      parseCurrentCnnFearGreed({
        fear_and_greed: { rating: 'Neutral' },
      }),
    ).toThrow('CNN FGI payload missing score and historical data');
  });
});
