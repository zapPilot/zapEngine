import { waitForEIP7702Confirmation } from '@zapengine/intent-engine';
import type { DepositPlan, PreparedTransaction } from '@zapengine/types/api';
import type { Address, Hash, WalletClient } from 'viem';

import { intentEngine } from '@/services/intentClient';
import type { WalletAtomicBatchExecutor } from '@/types';

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

function formatIncompatibleDelegationError(
  delegation: EIP7702DelegationInspection,
): string {
  return `This account is EIP-7702 delegated to ${formatDelegation(
    delegation,
  )} (another wallet). Reset or re-delegate via Ambire/OKX before depositing.`;
}

function formatBundleFailureError(
  callsId: string,
  delegation: EIP7702DelegationInspection,
): string {
  return `EIP-7702 bundle ${callsId} failed on-chain. Current delegation: ${formatDelegation(
    delegation,
  )}. Reset or re-delegate via Ambire/OKX before retrying.`;
}

const NEEDS_7702_WALLET_MESSAGE =
  'This deposit needs an EIP-7702 wallet with atomic batching (e.g. Ambire or OKX).';

function isAtomicUnsupportedError(error: string | undefined): boolean {
  if (!error) {
    return false;
  }

  const message = error.toLowerCase();
  return (
    message.includes('atomicity not supported') ||
    message.includes('forceatomic') ||
    message.includes('eip-7702 not supported') ||
    message.includes('wallet_sendcalls') ||
    message.includes('method not found') ||
    message.includes('method not supported') ||
    message.includes('unsupported wc_ method') ||
    message.includes('unsupported eip-7702 chain id')
  );
}

export async function executeDepositPlan({
  plan,
  walletClient,
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

  // Reliable on-chain pre-flight via eth_getCode. We deliberately do NOT pre-gate
  // on wallet_getCapabilities: it is unreliable through wallet abstractions
  // (wallets omit chains rather than reporting them unsupported), so a hard
  // capability check would wrongly block the Ambire/OKX wallets we support. If
  // the wallet genuinely cannot batch atomically, we surface that reactively
  // from the submission error below.
  const delegation = await inspectDelegation({
    address: walletAddress,
    chainId,
  });
  if (delegation.compatibility === 'unsupported') {
    throw new Error(formatIncompatibleDelegationError(delegation));
  }

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

    const latestDelegation = await inspectDelegation({
      address: walletAddress,
      chainId,
    }).catch(() => delegation);
    throw new Error(formatBundleFailureError(result.callsId, latestDelegation));
  }

  if (isAtomicUnsupportedError(result.error)) {
    throw new Error(NEEDS_7702_WALLET_MESSAGE);
  }

  throw new Error(
    result.error ?? 'EIP-7702 batch failed to return a calls bundle id',
  );
}
