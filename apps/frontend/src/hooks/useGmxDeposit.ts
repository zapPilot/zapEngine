import type { GmxV2MarketKey } from '@zapengine/intent-engine';
import type { DepositPlan, PreparedTransaction } from '@zapengine/types/api';
import { useCallback, useState } from 'react';
import type { Address, Hash } from 'viem';
import { arbitrum } from 'viem/chains';

import { extractErrorMessage } from '@/lib/errors';
import {
  type DepositExecutionTier,
  executeDepositPlan,
} from '@/lib/wallet/executeDepositPlan';
import { useWalletProvider } from '@/providers/WalletProvider';
import { getGmxDepositPlan } from '@/services/planOrchestrationService';
import { logger } from '@/utils/logger';

export type GmxDepositStepStatus = 'pending' | 'submitted' | 'confirmed';

export interface GmxDepositStepProgress {
  index: number;
  label: string;
  status: GmxDepositStepStatus;
  txHash?: Hash;
}

interface RunGmxDepositInput {
  marketKey: GmxV2MarketKey;
  amount: string;
}

export type GmxDepositResult =
  | { kind: 'eip7702'; callsId: string; transactionHash?: Hash }
  | { kind: 'sequential'; hashes: Hash[] };

const gmxDepositLogger = logger.createContextLogger('GmxDeposit');

function stepLabel(tx: PreparedTransaction): string {
  if (
    tx.meta.intentType === 'APPROVAL' ||
    tx.meta.intentType === 'ERC20_APPROVE'
  ) {
    return 'Approval';
  }
  if (tx.meta.intentType === 'SWAP') {
    return 'Swap';
  }
  return 'GMX deposit';
}

function initialSteps(plan: DepositPlan): GmxDepositStepProgress[] {
  return [...plan.approvals, ...plan.calls].map((tx, index) => ({
    index,
    label: stepLabel(tx),
    status: 'pending',
  }));
}

export function useGmxDeposit() {
  const { account, chain, getWalletClient, switchChain } = useWalletProvider();
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<unknown>(null);
  const [tier, setTier] = useState<DepositExecutionTier | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);
  const [lastTxHashes, setLastTxHashes] = useState<Hash[]>([]);
  const [lastCallsId, setLastCallsId] = useState<string | null>(null);
  const [lastPlan, setLastPlan] = useState<DepositPlan | null>(null);
  const [steps, setSteps] = useState<GmxDepositStepProgress[]>([]);

  const updateStep = useCallback(
    (index: number, patch: Partial<GmxDepositStepProgress>) => {
      setSteps((current) =>
        current.map((step) =>
          step.index === index ? { ...step, ...patch } : step,
        ),
      );
    },
    [],
  );

  const markAllSteps = useCallback(
    (status: GmxDepositStepStatus, txHash?: Hash) => {
      setSteps((current) =>
        current.map((step) => ({
          ...step,
          status,
          ...(txHash ? { txHash } : {}),
        })),
      );
    },
    [],
  );

  const run = useCallback(
    async ({
      marketKey,
      amount,
    }: RunGmxDepositInput): Promise<GmxDepositResult> => {
      setPending(true);
      setLastError(null);
      setTier(null);
      setLastTxHash(null);
      setLastTxHashes([]);
      setLastCallsId(null);
      setLastPlan(null);
      setSteps([]);

      try {
        const userAddress = account?.address as Address | undefined;
        if (!userAddress) {
          throw new Error('Connect wallet first');
        }

        if (chain?.id !== arbitrum.id) {
          await switchChain(arbitrum.id);
        }

        const plan = await getGmxDepositPlan({
          kind: 'gmx-v2',
          marketKey,
          amount,
          userAddress,
        });
        setLastPlan(plan);
        setSteps(initialSteps(plan));

        const walletClient = await getWalletClient(arbitrum.id);
        const execution = await executeDepositPlan({
          plan,
          walletClient,
          chainId: arbitrum.id,
          onBundleSubmitted: (callsId) => {
            setTier('eip7702');
            setLastCallsId(callsId);
            markAllSteps('submitted');
          },
          onBundleConfirmed: (transactionHash) => {
            setLastTxHash(transactionHash ?? null);
            markAllSteps('confirmed', transactionHash);
          },
          onApprovalSubmitted: (index) => {
            updateStep(index, { status: 'submitted' });
          },
          onApprovalConfirmed: (index, _tx, hash) => {
            updateStep(index, { status: 'confirmed', txHash: hash });
          },
          onCallSubmitted: (index) => {
            updateStep(plan.approvals.length + index, { status: 'submitted' });
          },
          onCallConfirmed: (index, _tx, hash) => {
            updateStep(plan.approvals.length + index, {
              status: 'confirmed',
              txHash: hash,
            });
          },
        });

        if (execution.kind === 'eip7702') {
          setTier('eip7702');
          setLastCallsId(execution.callsId);
          setLastTxHash(execution.transactionHash ?? null);
          return execution;
        }

        setTier('sequential');
        setLastTxHashes(execution.hashes);
        setLastTxHash(execution.hashes.at(-1) ?? null);
        return execution;
      } catch (error) {
        gmxDepositLogger.error('[gmx-deposit] failed:', error);
        setLastError(error);
        throw error;
      } finally {
        setPending(false);
      }
    },
    [
      account?.address,
      chain?.id,
      getWalletClient,
      markAllSteps,
      switchChain,
      updateStep,
    ],
  );

  return {
    run,
    pending,
    lastError,
    tier,
    lastTxHash,
    lastTxHashes,
    lastCallsId,
    lastPlan,
    steps,
    getErrorMessage: (error: unknown) =>
      extractErrorMessage(error, 'Unexpected error'),
  };
}
