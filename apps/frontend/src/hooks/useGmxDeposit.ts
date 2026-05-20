import type { GmxV2MarketKey } from '@zapengine/intent-engine';
import type { DepositPlan, PreparedTransaction } from '@zapengine/types/api';
import { useCallback, useState } from 'react';
import type { Hash } from 'viem';
import { arbitrum } from 'viem/chains';

import {
  ensureChain,
  requireUserAddress,
  useDepositExecutionState,
} from '@/hooks/useDepositExecutionState';
import { executeDepositPlan } from '@/lib/wallet/executeDepositPlan';
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
  const { state, actions } = useDepositExecutionState();
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
    ({ marketKey, amount }: RunGmxDepositInput): Promise<GmxDepositResult> =>
      actions.run(
        async () => {
          setSteps([]);

          const userAddress = requireUserAddress(account?.address);
          await ensureChain(chain?.id, arbitrum.id, switchChain);

          const plan = await getGmxDepositPlan({
            kind: 'gmx-v2',
            marketKey,
            amount,
            userAddress,
          });
          actions.setLastPlan(plan);
          setSteps(initialSteps(plan));

          const walletClient = await getWalletClient(arbitrum.id);
          const execution = await executeDepositPlan({
            plan,
            walletClient,
            chainId: arbitrum.id,
            onBundleSubmitted: (callsId) => {
              actions.markBundleSubmitted(callsId);
              markAllSteps('submitted');
            },
            onBundleConfirmed: (transactionHash) => {
              actions.markBundleConfirmed(transactionHash);
              markAllSteps('confirmed', transactionHash);
            },
            onApprovalSubmitted: (index) => {
              updateStep(index, { status: 'submitted' });
            },
            onApprovalConfirmed: (index, _tx, hash) => {
              updateStep(index, { status: 'confirmed', txHash: hash });
            },
            onCallSubmitted: (index) => {
              updateStep(plan.approvals.length + index, {
                status: 'submitted',
              });
            },
            onCallConfirmed: (index, _tx, hash) => {
              updateStep(plan.approvals.length + index, {
                status: 'confirmed',
                txHash: hash,
              });
            },
          });

          return actions.applyExecutionResult(execution);
        },
        (error) => gmxDepositLogger.error('[gmx-deposit] failed:', error),
      ),
    [
      account?.address,
      chain?.id,
      getWalletClient,
      switchChain,
      markAllSteps,
      updateStep,
      actions,
    ],
  );

  return {
    run,
    ...state,
    steps,
  };
}
