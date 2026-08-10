import {
  GMX_V2_BASKET_MARKET_KEYS,
  GMX_V2_EXECUTION_FEE_WEI,
} from '@zapengine/intent-engine';

/** Total keeper fee reserved when depositing into the four-pool GMX basket. */
export const GMX_V2_BASKET_EXECUTION_FEE_WEI =
  BigInt(GMX_V2_EXECUTION_FEE_WEI) * BigInt(GMX_V2_BASKET_MARKET_KEYS.length);
