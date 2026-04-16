import type { SwapToken } from "@/types/ui/ui.types";

type TransactionType = "deposit" | "withdraw" | "rebalance";

export interface ChainData {
  chainId: number;
  name: string;
  symbol: string;
  iconUrl?: string;
  isActive: boolean;
  isTestnet?: boolean;
}

export interface TokenBalance {
  balance: string;
  usdValue: number;
}

export interface TransactionFormData {
  chainId: number;
  tokenAddress: string;
  amount: string;
  slippage?: number | undefined;
  intensity?: number | undefined;
}

export interface TransactionResult {
  type: TransactionType;
  status: "success" | "error";
  txHash: string;
  amount: string;
  token: string;
  timestamp: number;
  message?: string;
}

export interface TransactionToken extends SwapToken {
  usdPrice?: number | undefined;
  category?: "stable" | "crypto";
  popular?: boolean;
}

// ============================================================================
// ALLOCATION TYPES - Re-exported from consolidated module
// ============================================================================

/**
 * @see {@link module:allocation} - Single source of truth for allocation types
 */
export type {
  AllocationBreakdown,
  RegimeAllocationBreakdown,
} from "./allocation";
