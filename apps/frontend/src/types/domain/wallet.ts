import type { Account, Chain, Hex, Transport, WalletClient } from 'viem';

/**
 * Simplified Wallet Types
 *
 * Essential types for wallet operations without over-abstraction.
 * Focused on current wagmi usage while maintaining future flexibility.
 */

/**
 * NOTE: Chain configuration has been moved to @/config/chains
 * Import chain utilities from there instead:
 *
 * import {
 *   getChainById,
 *   isChainSupported,
 *   getSupportedMainnetChains,
 *   getChainName,
 *   getChainSymbol
 * } from '@/config/chains';
 */

export type ConnectedWalletClient = WalletClient<Transport, Chain, Account>;

export interface WalletTypedData {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface WalletProviderInterface {
  account: {
    address: string;
    isConnected: boolean;
    balance?: string;
  } | null;
  chain: {
    id: number;
    name: string;
    symbol: string;
  } | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  switchChain(chainId: number): Promise<void>;
  sendTransaction(tx: {
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
    chainId: number;
    gas?: bigint;
  }): Promise<`0x${string}`>;
  getWalletClient(chainId?: number): Promise<ConnectedWalletClient>;
  signMessage(message: string): Promise<string>;
  signTypedData(typedData: WalletTypedData): Promise<Hex>;
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  error: { message: string; code?: string } | null;
  clearError(): void;

  // Multi-wallet support (V22 Phase 2A)
  connectedWallets: {
    address: string;
    isActive: boolean;
  }[];
  switchActiveWallet(address: string): Promise<void>;
  hasMultipleWallets: boolean;
}
