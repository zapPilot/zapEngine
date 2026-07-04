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

export const gmxMarketOptions = [
  { key: 'btc-btc', label: 'BTC/BTC' },
  { key: 'eth-eth', label: 'ETH/ETH' },
  { key: 'btc-usdc', label: 'BTC/USDC' },
  { key: 'eth-usdc', label: 'ETH/USDC' },
] as const satisfies readonly {
  key: DesktopGmxMarketKey;
  label: string;
}[];

export const GMX_DEPOSIT_PATHS: readonly GmxV2DepositPath[] =
  gmxMarketOptions.map((market) => ({
    kind: 'gmx-v2',
    id: `gmx-v2-${market.key}`,
    chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    marketKey: market.key,
    marketLabel: market.label,
  }));

export const DEPOSIT_PATHS: readonly DesktopDepositPath[] = [
  DEFAULT_DEPOSIT_PATH,
  ...GMX_DEPOSIT_PATHS,
];

export function isGmxDepositPath(
  path: DesktopDepositPath,
): path is GmxV2DepositPath {
  return path.kind === 'gmx-v2';
}

export function depositPathProtocolLabel(path: DesktopDepositPath): string {
  if (isGmxDepositPath(path)) {
    return `GMX v2 GM ${path.marketLabel}`;
  }

  return 'Base Morpho / Invest';
}

export function depositPathChainLabel(path: DesktopDepositPath): string {
  return isGmxDepositPath(path) ? 'Arbitrum' : 'Base';
}

export function depositPathInputLabel(path: DesktopDepositPath): string {
  return isGmxDepositPath(path) ? 'Arbitrum USDC' : 'Base USDC / ETH';
}
