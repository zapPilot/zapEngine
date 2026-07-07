import { HYPERCORE_CHAIN_ID } from '@zapengine/types/api';
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains';

/**
 * Display-name registry for chains that can appear in the UI. Not every entry
 * is wallet-connectable — HyperCore (1337) is a bridge destination only.
 * Falls back to `Chain <id>` for ids that aren't registered, matching the
 * previous inline `chainName(chainId)` ladder it replaces.
 */
const CHAIN_NAMES: Readonly<Record<number, string>> = {
  [mainnet.id]: 'Ethereum',
  [arbitrum.id]: 'Arbitrum',
  [base.id]: 'Base',
  [optimism.id]: 'Optimism',
  [polygon.id]: 'Polygon',
  [HYPERCORE_CHAIN_ID]: 'Hyperliquid',
};

export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}
