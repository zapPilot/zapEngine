import { z } from 'zod';
import type { Address, Hash, TransactionReceipt } from 'viem';

// Prepared transaction ready to be signed and sent
export const PreparedTransactionSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  data: z.string().startsWith('0x'),
  value: z.string().regex(/^\d+$/),
  chainId: z.number(),
  gasLimit: z.string().optional(),
  // Metadata for UI/tracking
  meta: z.object({
    intentId: z.string().optional(),
    intentType: z.string(),
    estimatedGas: z.string().optional(),
    estimatedDuration: z.number().optional(), // seconds
    route: z.unknown().optional(), // LI.FI route object
  }),
});

export type PreparedTransaction = z.infer<typeof PreparedTransactionSchema>;

// Quote response from LI.FI
export interface TransactionQuote {
  transaction: PreparedTransaction;
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    gasCostUsd: string;
    executionDuration: number; // seconds
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
  // this approval when executing via Multicall3 (EIP-7702 can bundle it).
  approval?: {
    tokenAddress: Address;
    spenderAddress: Address;
    amount: string;
  };
  // Execution strategy determined at runtime
  strategy?: 'eip7702' | 'multicall3' | 'sequential';
}

// Simulation result (for Tenderly or similar)
export interface SimulationResult {
  success: boolean;
  gasUsed?: string;
  error?: string;
  logs?: unknown[];
  stateChanges?: Array<{
    address: Address;
    key: string;
    before: string;
    after: string;
  }>;
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
