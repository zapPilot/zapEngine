import type { ApprovedWalletBrand } from '@core/lib/wallet/approvedWallets';
import type { PreparedTransaction } from '@zapengine/types/api';
import type { Account, Chain, Hash, Hex, Transport, WalletClient } from 'viem';

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
 * } from '@core/config/chains';
 */

export type ConnectedWalletClient = WalletClient<Transport, Chain, Account>;

export interface WalletAtomicBatchResult {
  callsId: string;
  transactionHash?: Hash;
}

export type WalletAtomicBatchExecutor = (
  transactions: PreparedTransaction[],
  chainId: number,
) => Promise<WalletAtomicBatchResult>;

/**
 * Exact batch that was shown to the user in the unified execution review.
 *
 * The hashes are deliberately supplied by the review caller instead of being
 * computed in the wallet adapter.  This keeps the wallet executor from ever
 * signing a batch different from the one the user approved.
 */
export interface WalletReviewedBatchInput {
  transactions: PreparedTransaction[];
  chainId: number;
  /** Wallet address captured by the server review. */
  expectedWalletAddress: string;
  /** Hash of the ordered transaction batch from the server review. */
  expectedBatchFingerprint: string;
  /** Server review expiry (milliseconds since epoch). */
  expiresAt: number;
  /** Server fail-closed gate; failed/unavailable reviews must be false. */
  executionAllowed: boolean;
  expectedSimulationFingerprint: string;
  expectedRiskHash: string;
  requiresRiskAcknowledgement: boolean;
  /** Required for warning reviews; should equal `expectedRiskHash`. */
  acknowledgedRiskHash?: string;
}

export type WalletReviewedBatchResult =
  | (WalletAtomicBatchResult & { status: 'submitted' })
  | {
      status: 'review-changed';
      reason:
        | 'simulation-fingerprint-mismatch'
        | 'risk-hash-mismatch'
        | 'batch-fingerprint-mismatch'
        | 'wallet-address-mismatch'
        | 'server-review-changed';
      simulationFingerprint?: string;
      riskHash?: string;
    }
  | {
      status: 'blocked';
      reason: string;
      code?: string;
    };

export type WalletReviewedBatchExecutor = (
  input: WalletReviewedBatchInput,
) => Promise<WalletReviewedBatchResult>;

export interface WalletReviewedBatchStatusInput {
  callsId: string;
  chainId: number;
}

export type WalletReviewedBatchStatus =
  | { status: 'confirmed'; transactionHash?: Hash }
  | { status: 'failed'; reason: string }
  | { status: 'unknown'; reason: string };

export type WalletReviewedBatchStatusExecutor = (
  input: WalletReviewedBatchStatusInput,
) => Promise<WalletReviewedBatchStatus>;

export interface WalletTypedData {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface WalletProviderInterface {
  /** Stable brand of the active external wallet; absent for Privy/native. */
  readonly externalWalletBrand?: ApprovedWalletBrand;
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
  executeAtomicBatch?: WalletAtomicBatchExecutor;
  /**
   * Execute exactly the batch a unified review approved without opening the
   * legacy Privy preview sheet.  The executor must compare both review hashes
   * before asking the wallet to sign.
   */
  executeReviewedBatch?: WalletReviewedBatchExecutor;
  /** Poll an accepted reviewed batch without ever resubmitting it. */
  waitForReviewedBatch?: WalletReviewedBatchStatusExecutor;
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

  /**
   * How this backend executes a batch of prepared transactions, so callers
   * can pick the right execution path without depending on `executeAtomicBatch`
   * (which only the Privy backend implements):
   * - `'atomic-batch'`: `executeAtomicBatch` is present (Privy server-side batch).
   * - `'eip7702'`: no `executeAtomicBatch`, but `getWalletClient` returns a
   *   signer the generic `intentEngine.executeWithEIP7702` path can drive.
   * - `undefined`: neither is available — callers should treat the wallet as
   *   unable to execute a deposit plan.
   */
  executionMode?: 'atomic-batch' | 'eip7702';
}

/** A discoverable wallet a user can pick in the connect UI (web/desktop only). */
export interface WalletConnectorOption {
  /** Stable connector id — for EIP-6963-discovered wallets, this is their rdns. */
  id: string;
  name: string;
  /** EIP-6963 icon data-URI, when the wallet provided one. */
  icon?: string;
  recommended: boolean;
  type: 'injected' | 'walletConnect';
}
