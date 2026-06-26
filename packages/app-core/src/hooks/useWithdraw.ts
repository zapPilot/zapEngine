import {
  ensureChain,
  requireUserAddress,
  useDepositExecutionState,
} from '@core/hooks/useDepositExecutionState';
import { executeDepositPlan } from '@core/lib/wallet/executeDepositPlan';
import { useWalletProvider } from '@core/providers/WalletProvider';
import { getWithdrawPlan } from '@core/services/planOrchestrationService';
import { logger } from '@core/utils/logger';
import type { GmxV2MarketKey } from '@zapengine/intent-engine';
import type {
  PlanOrchestrationWithdrawRequest,
  PreparedTransaction,
  WithdrawPlan,
} from '@zapengine/types/api';
import { useCallback, useState } from 'react';
import type { Address, Hash } from 'viem';
import { arbitrum } from 'viem/chains';

export type WithdrawStepStatus = 'pending' | 'submitted' | 'confirmed';

export interface WithdrawStepProgress {
  index: number;
  label: string;
  status: WithdrawStepStatus;
  txHash?: Hash;
}

export type RunWithdrawInput =
  | { kind: 'gmx-v2'; marketKey: GmxV2MarketKey; gmAmount: string }
  | {
      kind: 'morpho';
      vaultAddress: Address;
      shareAmount: string;
      chainId: number;
      toToken?: Address;
    };

export type WithdrawResult =
  | { kind: 'eip7702'; callsId: string; transactionHash?: Hash }
  | { kind: 'sequential'; hashes: Hash[] };

const withdrawLogger = logger.createContextLogger('Withdraw');

export function stepLabel(tx: PreparedTransaction): string {
  if (
    tx.meta.intentType === 'APPROVAL' ||
    tx.meta.intentType === 'ERC20_APPROVE'
  ) {
    return 'Approval';
  }
  if (tx.meta.intentType === 'SWAP') {
    return 'Swap';
  }
  return 'Withdraw';
}

export function initialSteps(plan: WithdrawPlan): WithdrawStepProgress[] {
  return [...plan.approvals, ...plan.calls].map((tx, index) => ({
    index,
    label: stepLabel(tx),
    status: 'pending',
  }));
}

export function targetChainId(input: RunWithdrawInput): number {
  return input.kind === 'gmx-v2' ? arbitrum.id : input.chainId;
}

export function planRequest(
  input: RunWithdrawInput,
  userAddress: Address,
): PlanOrchestrationWithdrawRequest {
  if (input.kind === 'gmx-v2') {
    return {
      kind: 'gmx-v2',
      marketKey: input.marketKey,
      gmAmount: input.gmAmount,
      userAddress,
    };
  }
  return {
    kind: 'morpho',
    userAddress,
    vaultAddress: input.vaultAddress,
    shareAmount: input.shareAmount,
    chainId: input.chainId,
    ...(input.toToken ? { toToken: input.toToken } : {}),
  };
}

/**
 * Dev-only withdraw execution hook, mirroring `useGmxDeposit`. Handles both the
 * GMX-v2 GM-market withdrawal (Arbitrum, keeper-settled native tokens) and the
 * Morpho redeem (+ optional LiFi swap into a chosen token). Reuses the shared
 * deposit execution state machine and the EIP-7702 plan executor.
 *
 * Instantiate once per panel — each call owns its own pending/steps state.
 */
export function useWithdraw() {
  const { account, chain, executeAtomicBatch, getWalletClient, switchChain } =
    useWalletProvider();
  const { state, actions } = useDepositExecutionState<WithdrawPlan>();
  const [steps, setSteps] = useState<WithdrawStepProgress[]>([]);

  const updateStep = useCallback(
    (index: number, patch: Partial<WithdrawStepProgress>) => {
      setSteps((current) =>
        current.map((step) =>
          step.index === index ? { ...step, ...patch } : step,
        ),
      );
    },
    [],
  );

  const markAllSteps = useCallback(
    (status: WithdrawStepStatus, txHash?: Hash) => {
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
    (input: RunWithdrawInput): Promise<WithdrawResult> =>
      actions.run(
        async () => {
          setSteps([]);

          const userAddress = requireUserAddress(account?.address);
          const chainId = targetChainId(input);
          await ensureChain(chain?.id, chainId, switchChain);

          const plan = await getWithdrawPlan(planRequest(input, userAddress));
          actions.setLastPlan(plan);
          setSteps(initialSteps(plan));

          const walletClient = await getWalletClient(chainId);
          const execution = await executeDepositPlan({
            plan,
            walletClient,
            chainId,
            ...(executeAtomicBatch ? { executeAtomicBatch } : {}),
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
        (error) => withdrawLogger.error('[withdraw] failed:', error),
      ),
    [
      account?.address,
      chain?.id,
      executeAtomicBatch,
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
