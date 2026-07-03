import { HYPERCORE_CHAIN_ID } from '@zapengine/types/api';

import { SUPPORTED_CHAINS } from './definitions';

export { HYPERCORE_CHAIN_ID };

/**
 * Display-only chain metadata (names, icons, explorer links). Deliberately
 * separate from SUPPORTED_CHAINS / wallet chain configs: entries here are NOT
 * wallet-switchable — HyperCore (1337) has no RPC and must never reach
 * switchChain or executeAtomicBatch.
 */
export interface DisplayChainInfo {
  id: number;
  name: string;
  iconUrl?: string;
  explorer: {
    name: string;
    txUrl: (hash: string) => string;
    addressUrl: (address: string) => string;
  };
}

function evmDisplayChains(): DisplayChainInfo[] {
  return SUPPORTED_CHAINS.map((chain) => {
    const explorerBase = chain.blockExplorers.default.url.replace(/\/$/, '');
    return {
      id: chain.id,
      name: chain.name,
      ...(chain.iconUrl ? { iconUrl: chain.iconUrl } : {}),
      explorer: {
        name: chain.blockExplorers.default.name,
        txUrl: (hash: string) => `${explorerBase}/tx/${hash}`,
        addressUrl: (address: string) => `${explorerBase}/address/${address}`,
      },
    };
  });
}

const HYPERCORE_DISPLAY_CHAIN: DisplayChainInfo = {
  id: HYPERCORE_CHAIN_ID,
  name: 'Hyperliquid',
  iconUrl: '/protocols/hyperliquid.webp',
  explorer: {
    name: 'Hyperliquid Explorer',
    txUrl: (hash: string) => `https://app.hyperliquid.xyz/explorer/tx/${hash}`,
    addressUrl: (address: string) =>
      `https://app.hyperliquid.xyz/explorer/address/${address}`,
  },
};

const DISPLAY_CHAINS: ReadonlyMap<number, DisplayChainInfo> = new Map(
  [...evmDisplayChains(), HYPERCORE_DISPLAY_CHAIN].map((chain) => [
    chain.id,
    chain,
  ]),
);

export function getDisplayChain(chainId: number): DisplayChainInfo | null {
  return DISPLAY_CHAINS.get(chainId) ?? null;
}

/** Explorer link for a transaction, or null when the chain is unknown. */
export function getExplorerTxUrl(chainId: number, hash: string): string | null {
  return getDisplayChain(chainId)?.explorer.txUrl(hash) ?? null;
}

export function getExplorerAddressUrl(
  chainId: number,
  address: string,
): string | null {
  return getDisplayChain(chainId)?.explorer.addressUrl(address) ?? null;
}
