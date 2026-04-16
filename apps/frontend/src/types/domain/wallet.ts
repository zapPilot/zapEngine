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
  signMessage(message: string): Promise<string>;
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
