import {
  PreparedTransactionSchema,
  type PreparedTransaction,
} from '@zapengine/types/api';
import type { Address, Hash, TransactionReceipt } from 'viem';

// The prepared-transaction wire contract lives in @zapengine/types (it is what
// POST /plan-orchestration/deposit returns); re-exported here so the builders
// keep a single local import site for transaction shapes.
export { PreparedTransactionSchema, type PreparedTransaction };

// Quote response from LI.FI
export interface TransactionQuote {
  transaction: PreparedTransaction;
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    gasCostUsd: string;
    feeCostUsd: string;
    executionDuration: number; // seconds
    tool: string;
  };
  approval?: {
    tokenAddress: Address;
    spenderAddress: Address;
    amount: string;
  };
  route?: unknown; // LI.FI RouteExtended for debugging
}

// Multi-step transaction plan (for rotate)
export interface RotateTransactionPlan {
  steps: PreparedTransaction[];
  estimates: {
    totalGasUsd: string;
    totalDuration: number; // seconds
    expectedOutput: string; // final amount
  };
  // Approval required before the LI.FI step, if any. Callers should prepend
  // this approval for EIP-7702 bundles or send it first in sequential mode.
  approval?: {
    tokenAddress: Address;
    spenderAddress: Address;
    amount: string;
  };
  // Execution strategy determined at runtime
  strategy?: 'eip7702' | 'sequential';
}

// Execution result
// For EIP-5792 batches, `callsId` is returned and can be resolved to a
// tx hash / receipt via `waitForEIP7702Confirmation`.
export interface ExecutionResult {
  success: boolean;
  callsId?: string;
  hash?: Hash;
  receipt?: TransactionReceipt;
  error?: string;
}
