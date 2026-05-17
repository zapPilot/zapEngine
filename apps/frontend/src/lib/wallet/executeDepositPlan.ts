import type { DepositPlan, PreparedTransaction } from '@zapengine/types/api';
import type { Hash, WalletClient } from 'viem';

import { getPublicClient, intentEngine } from '@/services/intentClient';

import { txRequest } from './txRequest';

export type DepositExecutionTier = 'eip7702' | 'sequential';

export type DepositPlanExecutionResult =
  | { kind: 'eip7702'; callsId: string; transactionHash?: Hash }
  | { kind: 'sequential'; hashes: Hash[] };

export interface ExecuteDepositPlanInput {
  plan: DepositPlan;
  walletClient: WalletClient;
  chainId: number;
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

interface ExecuteSequentialInput {
  plan: DepositPlan;
  walletClient: WalletClient;
  onApprovalSubmitted: ExecuteDepositPlanInput['onApprovalSubmitted'];
  onApprovalConfirmed: ExecuteDepositPlanInput['onApprovalConfirmed'];
  onCallSubmitted: ExecuteDepositPlanInput['onCallSubmitted'];
  onCallConfirmed: ExecuteDepositPlanInput['onCallConfirmed'];
}

async function sendPreparedTransaction(
  walletClient: WalletClient,
  tx: PreparedTransaction,
): Promise<Hash> {
  if (!walletClient.account) {
    throw new Error('Wallet client has no connected account');
  }

  return walletClient.sendTransaction({
    ...txRequest(tx, walletClient.account),
    chain: undefined,
  });
}

async function waitForTransaction(tx: PreparedTransaction, hash: Hash) {
  await getPublicClient(tx.chainId).waitForTransactionReceipt({ hash });
}

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
    message.includes('unsupported wc_ method')
  );
}

async function executeSequentially({
  plan,
  walletClient,
  onApprovalSubmitted,
  onApprovalConfirmed,
  onCallSubmitted,
  onCallConfirmed,
}: ExecuteSequentialInput): Promise<DepositPlanExecutionResult> {
  const hashes: Hash[] = [];
  for (const [index, tx] of plan.approvals.entries()) {
    const hash = await sendPreparedTransaction(walletClient, tx);
    hashes.push(hash);
    onApprovalSubmitted?.(index, tx, hash);
    await waitForTransaction(tx, hash);
    onApprovalConfirmed?.(index, tx, hash);
  }

  for (const [index, tx] of plan.calls.entries()) {
    const hash = await sendPreparedTransaction(walletClient, tx);
    hashes.push(hash);
    onCallSubmitted?.(index, tx, hash);
    await waitForTransaction(tx, hash);
    onCallConfirmed?.(index, tx, hash);
  }

  return { kind: 'sequential', hashes };
}

export async function executeDepositPlan({
  plan,
  walletClient,
  chainId,
  onBundleSubmitted,
  onBundleConfirmed,
  onApprovalSubmitted,
  onApprovalConfirmed,
  onCallSubmitted,
  onCallConfirmed,
}: ExecuteDepositPlanInput): Promise<DepositPlanExecutionResult> {
  const strategy = await intentEngine.getExecutionStrategy(
    walletClient,
    chainId,
  );

  if (strategy === 'eip7702') {
    const result = await intentEngine.executeWithEIP7702(
      [...plan.approvals, ...plan.calls],
      walletClient,
      { chainId },
    );
    if (!result.success || !result.callsId) {
      if (isAtomicUnsupportedError(result.error)) {
        return executeSequentially({
          plan,
          walletClient,
          onApprovalSubmitted,
          onApprovalConfirmed,
          onCallSubmitted,
          onCallConfirmed,
        });
      }

      throw new Error(
        result.error ?? 'EIP-7702 batch failed to return a calls bundle id',
      );
    }

    onBundleSubmitted?.(result.callsId);
    onBundleConfirmed?.();
    return {
      kind: 'eip7702',
      callsId: result.callsId,
    };
  }

  return executeSequentially({
    plan,
    walletClient,
    onApprovalSubmitted,
    onApprovalConfirmed,
    onCallSubmitted,
    onCallConfirmed,
  });
}
