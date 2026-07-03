import type { Chain, Hex } from 'viem';
import { toHex } from 'viem';
import { arbitrum, base, optimism } from 'viem/chains';

export const MOBILE_PRIVY_CHAINS = [
  arbitrum,
  base,
  optimism,
] as const satisfies readonly Chain[];
export const DEFAULT_MOBILE_PRIVY_CHAIN = arbitrum;

const MOBILE_PRIVY_CHAIN_BY_ID = new Map<number, Chain>(
  MOBILE_PRIVY_CHAINS.map((chain) => [chain.id, chain]),
);

export interface ConnectedWalletSummary {
  address: string;
  isActive: boolean;
}

export function getMobilePrivyChain(
  chainId: number | null | undefined,
): Chain {
  if (chainId === null || chainId === undefined) {
    return DEFAULT_MOBILE_PRIVY_CHAIN;
  }
  return MOBILE_PRIVY_CHAIN_BY_ID.get(chainId) ?? DEFAULT_MOBILE_PRIVY_CHAIN;
}

export function requireMobilePrivyChain(chainId: number): Chain {
  const chain = MOBILE_PRIVY_CHAIN_BY_ID.get(chainId);
  if (!chain) {
    throw new Error(`Unsupported Privy mobile chain ${chainId}`);
  }
  return chain;
}

export function toEip155HexChainId(chainId: number): Hex {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid EIP-155 chain id ${chainId}`);
  }
  return toHex(chainId);
}

export function shouldSwitchChain(
  currentChainId: number | null | undefined,
  targetChainId: number,
): boolean {
  return currentChainId !== targetChainId;
}

export function buildConnectedWallets(
  address: string | null | undefined,
): ConnectedWalletSummary[] {
  return address ? [{ address, isActive: true }] : [];
}
