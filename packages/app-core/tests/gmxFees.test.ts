import { describe, expect, it } from 'vitest';

import { GMX_V2_BASKET_EXECUTION_FEE_WEI } from '@core/gmxFees';
import {
  GMX_V2_BASKET_MARKET_KEYS,
  GMX_V2_EXECUTION_FEE_WEI,
} from '@zapengine/intent-engine';

describe('GMX basket fees', () => {
  it('reserves one execution fee per basket market', () => {
    expect(GMX_V2_BASKET_EXECUTION_FEE_WEI).toBe(
      BigInt(GMX_V2_EXECUTION_FEE_WEI) *
        BigInt(GMX_V2_BASKET_MARKET_KEYS.length),
    );
  });
});
