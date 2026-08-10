import {
  type ApprovedWalletBrand,
  approvedWalletLabel,
} from '@core/lib/wallet/approvedWallets';
import { intentEngine } from '@core/services/intentClient';
import type {
  WalletAtomicBatchExecutor,
  WalletAtomicBatchResult,
} from '@core/types';
import { waitForEIP7702Confirmation } from '@zapengine/intent-engine';
import type { DepositPlan, PreparedTransaction } from '@zapengine/types/api';
import type { Address, Hash, WalletClient } from 'viem';

import {
  type EIP7702DelegationInspection,
  inspectDelegation,
} from './eip7702Delegation';

export type DepositExecutionTier = 'eip7702' | 'sequential';

export type DepositPlanExecutionResult =
  | { kind: 'eip7702'; callsId: string; transactionHash?: Hash }
  | { kind: 'sequential'; hashes: Hash[] };

/**
 * The execution layer only needs the on-chain transactions to batch — the
 * approvals followed by the calls. Typing it as this structural subset (rather
 * than DepositPlan) lets WithdrawPlan reuse the exact same EIP-7702 path.
 */
export type ExecutablePlan = Pick<DepositPlan, 'approvals' | 'calls'>;

export interface ExecuteDepositPlanInput {
  plan: ExecutablePlan;
  walletClient?: WalletClient;
  externalWalletBrand?: ApprovedWalletBrand;
  chainId: number;
  executeAtomicBatch?: WalletAtomicBatchExecutor;
  onBundleSubmitted?: (callsId: string) => void;
  onBundleConfirmed?: (transactionHash?: Hash) => void;
  onApprovalSubmitted?: (
    index: number,
    tx: PreparedTransaction,
    hash: Hash,
  ) => void;
  onApprovalConfirmed?: (
    index: number,
    tx: PreparedTransaction,
    hash: Hash,
  ) => void;
  onCallSubmitted?: (
    index: number,
    tx: PreparedTransaction,
    hash: Hash,
  ) => void;
  onCallConfirmed?: (
    index: number,
    tx: PreparedTransaction,
    hash: Hash,
  ) => void;
}

function getWalletAddress(walletClient: WalletClient): Address {
  const account = walletClient.account;
  if (!account) {
    throw new Error('Wallet client has no connected account');
  }

  return typeof account === 'string' ? account : account.address;
}

function formatDelegation(delegation: EIP7702DelegationInspection): string {
  if (delegation.kind === 'notDelegated') {
    return 'no EIP-7702 delegation detected';
  }

  return `${delegation.label} (${delegation.implementation})`;
}

export class EIP7702WalletRecoveryError extends Error {
  readonly code = 'EIP7702_DELEGATION_MISMATCH';
  readonly originalWalletLabel?: string;

  constructor(
    delegation: EIP7702DelegationInspection,
    options: {
      activeWalletBrand?: ApprovedWalletBrand;
      reason?: 'inspection-failed' | 'unknown-active-wallet';
    } = {},
  ) {
    const reconnectTarget =
      delegation.kind === 'delegated' && delegation.walletLabel
        ? delegation.walletLabel
        : 'the wallet that originally enabled Smart Account features';
    const activeWalletLabel = options.activeWalletBrand
      ? approvedWalletLabel(options.activeWalletBrand)
      : null;
    const message =
      options.reason === 'inspection-failed'
        ? "Zap Pilot could not verify this account's EIP-7702 delegation on the target chain. The batch was not submitted."
        : options.reason === 'unknown-active-wallet'
          ? 'Zap Pilot could not identify the active browser wallet for EIP-7702 execution. Reconnect with an approved wallet before submitting.'
          : delegation.kind === 'delegated' &&
              delegation.walletBrand &&
              activeWalletLabel
            ? `The connected wallet is ${activeWalletLabel}, but this account's EIP-7702 delegation is owned by ${reconnectTarget}. Reconnect with ${reconnectTarget} to repair or clear the delegation before submitting.`
            : `The connected wallet cannot safely execute this account's current EIP-7702 delegation. Reconnect with ${reconnectTarget} before submitting.`;
    super(message);
    this.name = 'EIP7702WalletRecoveryError';
    if (delegation.kind === 'delegated' && delegation.walletLabel) {
      this.originalWalletLabel = delegation.walletLabel;
    }
  }
}

/**
 * Fail closed before `wallet_sendCalls` when the active wallet does not own
 * the execution ABI currently delegated to the EOA on the target chain.
 */
export async function assertEIP7702DelegationCompatibility({
  address,
  chainId,
  activeWalletBrand,
}: {
  address: Address;
  chainId: number;
  activeWalletBrand: ApprovedWalletBrand | undefined;
}): Promise<void> {
  if (!activeWalletBrand) {
    throw new EIP7702WalletRecoveryError(
      { kind: 'notDelegated' },
      { reason: 'unknown-active-wallet' },
    );
  }

  let delegation: EIP7702DelegationInspection;
  try {
    delegation = await inspectDelegation({ address, chainId });
  } catch {
    throw new EIP7702WalletRecoveryError(
      { kind: 'notDelegated' },
      { activeWalletBrand, reason: 'inspection-failed' },
    );
  }

  if (delegation.kind === 'notDelegated') {
    return;
  }
  if (!delegation.walletBrand || delegation.walletBrand !== activeWalletBrand) {
    throw new EIP7702WalletRecoveryError(delegation, {
      activeWalletBrand,
    });
  }
}

export function isEIP7702WalletRecoveryError(
  error: unknown,
): error is EIP7702WalletRecoveryError {
  return error instanceof EIP7702WalletRecoveryError;
}

function formatBundleFailureError(
  callsId: string,
  delegation: EIP7702DelegationInspection,
): string {
  return `EIP-7702 bundle ${callsId} failed on-chain. Current delegation: ${formatDelegation(
    delegation,
  )}. The wallet already submitted this bundle, so Zap Pilot will verify settlement before allowing another submission.`;
}

function errorIncludes(
  error: string | undefined,
  patterns: readonly string[],
): boolean {
  if (!error) {
    return false;
  }

  const message = error.toLowerCase();
  return patterns.some((pattern) => message.includes(pattern));
}

function isUserRejectedError(error: string | undefined): boolean {
  return errorIncludes(error, [
    'user rejected',
    'user denied',
    'request rejected',
    'code 4001',
    'error 4001',
    '5750',
  ]);
}

function isAtomicUnsupportedError(error: string | undefined): boolean {
  return errorIncludes(error, [
    'atomicity not supported',
    'forceatomic',
    'eip-7702 not supported',
    'wallet_sendcalls',
    'method not found',
    'method not supported',
    'unsupported wc_ method',
    'unsupported eip-7702 chain id',
    'insufficient capabilities',
    '5760',
  ]);
}

function isDelegationCompatibilityError(error: string | undefined): boolean {
  return errorIncludes(error, [
    'delegation',
    'delegate implementation',
    'smart account',
    'authorization',
    'invalid signature',
    'unsupported implementation',
    'incompatible account',
  ]);
}

async function inspectDelegationForDiagnostics(
  address: Address,
  chainId: number,
): Promise<EIP7702DelegationInspection> {
  try {
    return await inspectDelegation({ address, chainId });
  } catch {
    return { kind: 'notDelegated' };
  }
}

/**
 * Resolve the execution transport then run the plan: Privy's atomic batcher
 * when available, otherwise a chain RPC wallet client for the generic
 * EIP-7702 path. Shared by the invest/wizard hooks so neither re-implements
 * the transport choice.
 */
export async function executeDepositPlanWithWallet({
  getWalletClient,
  ...input
}: Omit<ExecuteDepositPlanInput, 'walletClient'> & {
  getWalletClient: (chainId: number) => Promise<WalletClient>;
}): Promise<DepositPlanExecutionResult> {
  const walletClient = input.executeAtomicBatch
    ? undefined
    : await getWalletClient(input.chainId);

  return executeDepositPlan({
    ...input,
    ...(walletClient ? { walletClient } : {}),
  });
}

async function submitPreparedTransactionsInternal({
  transactions,
  walletClient,
  chainId,
}: {
  transactions: PreparedTransaction[];
  walletClient: WalletClient;
  chainId: number;
}): Promise<{ result: WalletAtomicBatchResult }> {
  if (transactions.length === 0) {
    throw new Error('Cannot execute empty transaction array');
  }

  const result = await intentEngine.executeWithEIP7702(
    transactions,
    walletClient,
    { chainId },
  );
  if (result.success && result.callsId) {
    return { result: { callsId: result.callsId } };
  }
  throw new Error(
    result.error ?? 'EIP-7702 batch failed to return a calls bundle id',
  );
}

/**
 * Submit an exact, already-reviewed batch through an external EIP-7702
 * wallet. This intentionally stops once `wallet_sendCalls` returns a calls
 * id; status polling belongs to the progress/state layer and must not delay
 * the hand-off from the review screen.
 */
export async function submitPreparedTransactionsWithEIP7702({
  transactions,
  walletClient,
  chainId,
}: {
  transactions: PreparedTransaction[];
  walletClient: WalletClient;
  chainId: number;
}): Promise<WalletAtomicBatchResult> {
  const { result } = await submitPreparedTransactionsInternal({
    transactions,
    walletClient,
    chainId,
  });
  return result;
}

export async function executeDepositPlan({
  plan,
  walletClient,
  externalWalletBrand,
  chainId,
  executeAtomicBatch,
  onBundleSubmitted,
  onBundleConfirmed,
}: ExecuteDepositPlanInput): Promise<DepositPlanExecutionResult> {
  const transactions = [...plan.approvals, ...plan.calls];

  if (executeAtomicBatch) {
    const result = await executeAtomicBatch(transactions, chainId);
    onBundleSubmitted?.(result.callsId);
    if (result.transactionHash) {
      onBundleConfirmed?.(result.transactionHash);
    }
    return {
      kind: 'eip7702',
      callsId: result.callsId,
      ...(result.transactionHash
        ? { transactionHash: result.transactionHash }
        : {}),
    };
  }

  if (!walletClient) {
    throw new Error('Wallet client is required for generic EIP-7702 execution');
  }

  const walletAddress = getWalletAddress(walletClient);

  await assertEIP7702DelegationCompatibility({
    address: walletAddress,
    chainId,
    activeWalletBrand: externalWalletBrand,
  });

  const result = await intentEngine.executeWithEIP7702(
    transactions,
    walletClient,
    { chainId },
  );

  if (result.success && result.callsId) {
    onBundleSubmitted?.(result.callsId);

    const confirmation = await waitForEIP7702Confirmation(
      result.callsId,
      walletClient,
    ).catch(() => null);

    if (!confirmation) {
      // Wallet accepted the batch but cannot report calls status (e.g.
      // `wallet_getCallsStatus` unsupported). We cannot prove failure, so
      // surface the submitted bundle rather than risk double-submitting.
      onBundleConfirmed?.();
      return {
        kind: 'eip7702',
        callsId: result.callsId,
      };
    }

    if (confirmation.status === 'success') {
      onBundleConfirmed?.(confirmation.transactionHash);
      return {
        kind: 'eip7702',
        callsId: result.callsId,
        ...(confirmation.transactionHash
          ? { transactionHash: confirmation.transactionHash }
          : {}),
      };
    }

    const latestDelegation = await inspectDelegationForDiagnostics(
      walletAddress,
      chainId,
    );
    throw new Error(formatBundleFailureError(result.callsId, latestDelegation));
  }

  if (isUserRejectedError(result.error)) {
    throw new Error(result.error);
  }

  if (
    isAtomicUnsupportedError(result.error) ||
    isDelegationCompatibilityError(result.error)
  ) {
    const delegation = await inspectDelegationForDiagnostics(
      walletAddress,
      chainId,
    );
    throw new EIP7702WalletRecoveryError(delegation);
  }

  throw new Error(
    result.error ?? 'EIP-7702 batch failed to return a calls bundle id',
  );
}
