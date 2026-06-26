import { arbitrum, base, mainnet, polygon } from 'viem/chains';

/**
 * Display-name registry for supported EVM chains.
 *
 * Keep this list in sync with the chains the wallet provider can connect to.
 * Falls back to `Chain <id>` for ids that aren't registered, matching the
 * previous inline `chainName(chainId)` ladder it replaces.
 */
const CHAIN_NAMES: Readonly<Record<number, string>> = {
  [mainnet.id]: 'Ethereum',
  [arbitrum.id]: 'Arbitrum',
  [base.id]: 'Base',
  [polygon.id]: 'Polygon',
};

export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}
