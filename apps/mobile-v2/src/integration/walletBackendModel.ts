import { toHex, type Chain } from 'viem';
import { arbitrum, base, optimism } from 'viem/chains';

export const NATIVE_WALLET_SUPPORTED_CHAINS: [Chain, Chain, Chain] = [
  arbitrum,
  base,
  optimism,
];

export const DEFAULT_NATIVE_WALLET_CHAIN = arbitrum;

const CHAIN_BY_ID = new Map<number, Chain>(
  NATIVE_WALLET_SUPPORTED_CHAINS.map((chain) => [chain.id, chain]),
);

export interface ConnectedWalletListItem {
  address: string;
  isActive: boolean;
}

export function getNativeWalletChain(
  chainId: number | null | undefined,
): Chain {
  return (
    CHAIN_BY_ID.get(chainId ?? DEFAULT_NATIVE_WALLET_CHAIN.id) ??
    DEFAULT_NATIVE_WALLET_CHAIN
  );
}

export function assertNativeWalletChain(chainId: number): Chain {
  const chain = CHAIN_BY_ID.get(chainId);
  if (!chain) {
    throw new Error(`Unsupported mobile wallet chain ${chainId}`);
  }
  return chain;
}

export function buildConnectedWallets(
  address: string | null | undefined,
): ConnectedWalletListItem[] {
  return address ? [{ address, isActive: true }] : [];
}

export function shouldSwitchChain(
  currentChainId: number,
  requestedChainId: number,
): boolean {
  return currentChainId !== requestedChainId;
}

export function toWalletSwitchEthereumChainParams(
  chainId: number,
): [{ chainId: `0x${string}` }] {
  return [{ chainId: toHex(chainId) }];
}

export function toWalletError(error: unknown): {
  message: string;
  code?: string;
} {
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}
