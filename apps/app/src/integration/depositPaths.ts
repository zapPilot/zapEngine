import { BASE_CHAIN_ID, SUPPORTED_DEPOSIT_CHAINS } from '@zapengine/types/api';

export type DesktopGmxMarketKey =
  | 'btc-btc'
  | 'eth-eth'
  | 'btc-usdc'
  | 'eth-usdc';

export interface BaseInvestDepositPath {
  kind: 'base-invest';
  id: 'base-invest';
  chainId: typeof BASE_CHAIN_ID;
}

export interface GmxV2DepositPath {
  kind: 'gmx-v2';
  id: `gmx-v2-${DesktopGmxMarketKey}`;
  chainId: typeof SUPPORTED_DEPOSIT_CHAINS.ARBITRUM;
  marketKey: DesktopGmxMarketKey;
  marketLabel: string;
}

export type DesktopDepositPath = BaseInvestDepositPath | GmxV2DepositPath;

export const DEFAULT_DEPOSIT_PATH: BaseInvestDepositPath = {
  kind: 'base-invest',
  id: 'base-invest',
  chainId: BASE_CHAIN_ID,
};

export function isGmxDepositPath(
  path: DesktopDepositPath,
): path is GmxV2DepositPath {
  return path.kind === 'gmx-v2';
}
