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

export interface ApprovalRequirement {
  tokenAddress: Address;
  spenderAddress: Address;
  amount: string;
}

// Multi-step transaction plan (redeem, then an optional LI.FI step)
export interface RotateTransactionPlan {
  steps: PreparedTransaction[];
  estimates: {
    totalGasUsd: string;
    totalDuration: number; // seconds
    expectedOutput: string; // final amount
  };
  // Approval required before the LI.FI step, if any. Callers should prepend
  // this approval for EIP-7702 bundles or send it first in sequential mode.
  approval?: ApprovalRequirement;
  // Execution strategy determined at runtime
  strategy?: 'eip7702' | 'sequential';
}

// Vault-to-vault rotation: redeem, swap only when the underlying assets
// differ, then deposit into the destination vault.
export interface RotatePlan {
  steps: PreparedTransaction[];
  /** Every approval the steps need, in execution order. */
  approvals: ApprovalRequirement[];
  /** Source vault asset (`fromVault.asset()`), what the redeem returns. */
  assetToken: Address;
  /** Destination vault asset (`toVault.asset()`), what the deposit spends. */
  depositToken: Address;
  /** `previewRedeem(shareAmount)`, as a wei string. */
  redeemAmount: string;
  /**
   * Exact assets deposited: the swap's guaranteed minimum output, or the
   * redeemed amount when no swap is needed. Any better fill stays idle.
   */
  depositAmount: string;
  estimates: RotateTransactionPlan['estimates'];
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
