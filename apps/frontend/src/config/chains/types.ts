/**
 * Unified Chain Configuration Types
 *
 * This module defines the canonical types for blockchain network configuration
 * across the application. All chain-related data should derive from these types.
 */

export interface BaseChainConfig {
  /** Unique chain identifier */
  id: number;

  /** Human-readable chain name */
  name: string;

  /** Chain native token symbol */
  symbol: string;

  /** Whether this chain is supported in the current environment */
  isSupported: boolean;

  /** RPC endpoint URLs (primary and fallbacks) */
  rpcUrls: {
    default: { http: string[] };
    public?: { http: string[] };
  };

  /** Block explorer configuration */
  blockExplorers: {
    default: { name: string; url: string };
    etherscan?: { name: string; url: string };
  };

  /** Chain icon/logo URL */
  iconUrl?: string;

  /** Native currency details */
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };

  /** Additional metadata */
  metadata?: {
    /** Average block time in seconds */
    blockTime?: number;
    /** Layer type (L1, L2, etc.) */
    layer?: "L1" | "L2" | "L3";
    /** Parent chain for L2s */
    parentChain?: number;
  };
}
