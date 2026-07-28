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

type LinkedAccountRecord = Record<PropertyKey, unknown>;

function isLinkedAccountRecord(value: unknown): value is LinkedAccountRecord {
  return typeof value === 'object' && value !== null;
}

/**
 * Resolves the Privy Wallets API resource id for the active Expo embedded
 * wallet. Expo's user payload deliberately uses snake_case fields, unlike the
 * react-auth payload used by app-core's web adapter.
 */
export function resolveEmbeddedWalletId(
  linkedAccounts: readonly unknown[] | null | undefined,
  address: string | null | undefined,
): string | undefined {
  if (!address) {
    return undefined;
  }

  const normalizedAddress = address.toLowerCase();
  for (const account of linkedAccounts ?? []) {
    if (
      !isLinkedAccountRecord(account) ||
      account.connector_type !== 'embedded' ||
      account.chain_type !== 'ethereum' ||
      typeof account.address !== 'string' ||
      account.address.toLowerCase() !== normalizedAddress ||
      typeof account.id !== 'string'
    ) {
      continue;
    }
    return account.id;
  }

  return undefined;
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
