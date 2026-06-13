export {
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_EXCHANGE_ROUTER_ABI,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_GAS_ESTIMATES,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
  type GmxV2FundedSide,
  type GmxV2Market,
  type GmxV2MarketKey,
} from './gmx-v2.constants.js';
export {
  ZERO_ADDRESS,
  encodeGmxV2CreateDeposit,
  encodeGmxV2CreateDepositMulticall,
  encodeGmxV2CreateWithdrawal,
  encodeGmxV2CreateWithdrawalMulticall,
  encodeGmxV2SendTokens,
  encodeGmxV2SendWnt,
  type GmxV2CreateDepositMulticallParams,
  type GmxV2CreateDepositParams,
  type GmxV2CreateWithdrawalMulticallParams,
  type GmxV2CreateWithdrawalParams,
} from './gmx-v2.encoder.js';

import {
  GMX_V2_MARKETS,
  type GmxV2Market,
  type GmxV2MarketKey,
} from './gmx-v2.constants.js';

export function getGmxV2Market(marketKey: GmxV2MarketKey): GmxV2Market {
  return GMX_V2_MARKETS[marketKey];
}
