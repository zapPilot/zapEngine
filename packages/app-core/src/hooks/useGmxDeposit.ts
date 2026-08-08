import {
  ensureChain,
  requireUserAddress,
  useDepositExecutionState,
} from '@core/hooks/useDepositExecutionState';
import { executeDepositPlan } from '@core/lib/wallet/executeDepositPlan';
import { useWalletProvider } from '@core/providers/walletContext';
import { getPublicClient } from '@core/services/intentClient';
import { getGmxDepositPlan } from '@core/services/planOrchestrationService';
import type { ConnectedWalletClient } from '@core/types';
import { logger } from '@core/utils/logger';
import {
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_TOKENS,
  type GmxV2MarketKey,
} from '@zapengine/intent-engine';
import type { DepositPlan, PreparedTransaction } from '@zapengine/types/api';
import { useCallback, useRef, useState } from 'react';
import { type Address, erc20Abi, formatUnits, type Hash } from 'viem';
import { arbitrum } from 'viem/chains';

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
const GMX_EXECUTION_FEE = BigInt(GMX_V2_EXECUTION_FEE_WEI);

export function walletClientAddress(
  walletClient: ConnectedWalletClient,
  fallback: Address,
): Address {
  const account = walletClient.account;
  if (!account) {
    return fallback;
  }

  return typeof account === 'string' ? account : account.address;
}

export function formatEth(value: bigint): string {
  return formatUnits(value, 18);
}

export function formatUsdc(value: bigint): string {
  return formatUnits(value, GMX_V2_TOKENS.USDC.decimals);
}

export async function assertGmxDepositPreflight(params: {
  address: Address;
  amount: bigint;
}): Promise<void> {
  const publicClient = getPublicClient(arbitrum.id);
  const [usdcBalance, nativeBalance] = await Promise.all([
    publicClient.readContract({
      address: GMX_V2_TOKENS.USDC.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [params.address],
    }),
    publicClient.getBalance({ address: params.address }),
  ]);

  if (usdcBalance < params.amount) {
    throw new Error(
      `GMX Arbitrum USDC balance too low: need ${formatUsdc(
        params.amount,
      )} USDC, have ${formatUsdc(usdcBalance)} USDC.`,
    );
  }

  if (nativeBalance < GMX_EXECUTION_FEE) {
    throw new Error(
      `GMX execution fee requires 0.001 ETH on Arbitrum (have ${formatEth(
        nativeBalance,
      )} ETH).`,
    );
  }
}

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
  return 'GMX deposit';
}

export function initialSteps(plan: DepositPlan): GmxDepositStepProgress[] {
  return [...plan.approvals, ...plan.calls].map((tx, index) => ({
    index,
    label: stepLabel(tx),
    status: 'pending',
  }));
}

export function useGmxDeposit() {
  const { account, chain, executeAtomicBatch, getWalletClient, switchChain } =
    useWalletProvider();
  const { state, actions } = useDepositExecutionState();
  const [steps, setSteps] = useState<GmxDepositStepProgress[]>([]);
  const runIdRef = useRef(0);

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
    ({ marketKey, amount }: RunGmxDepositInput): Promise<GmxDepositResult> => {
      const runId = ++runIdRef.current;
      const isCurrentRun = () => runId === runIdRef.current;
      const assertCurrentRun = () => {
        if (!isCurrentRun()) {
          throw new DOMException(
            'Superseded by a newer GMX deposit run',
            'AbortError',
          );
        }
      };

      return actions.run(
        async () => {
          setSteps([]);

          const userAddress = requireUserAddress(account?.address);
          await ensureChain(chain?.id, arbitrum.id, switchChain);
          assertCurrentRun();

          const walletClient = await getWalletClient(arbitrum.id);
          assertCurrentRun();
          const effectiveAddress = walletClientAddress(
            walletClient,
            userAddress,
          );
          const parsedAmount = BigInt(amount);

          gmxDepositLogger.info('[gmx-deposit] preflight', {
            currentChainId: chain?.id,
            targetChainId: arbitrum.id,
            accountAddress: userAddress,
            effectiveAddress,
            amount,
          });
          await assertGmxDepositPreflight({
            address: effectiveAddress,
            amount: parsedAmount,
          });
          assertCurrentRun();

          const plan = await getGmxDepositPlan({
            kind: 'gmx-v2',
            marketKey,
            amount,
            userAddress: effectiveAddress,
          });
          assertCurrentRun();
          actions.setLastPlan(plan);
          setSteps(initialSteps(plan));

          const execution = await executeDepositPlan({
            plan,
            walletClient,
            chainId: arbitrum.id,
            ...(executeAtomicBatch ? { executeAtomicBatch } : {}),
            onBundleSubmitted: (callsId) => {
              if (!isCurrentRun()) return;
              actions.markBundleSubmitted(callsId);
              markAllSteps('submitted');
            },
            onBundleConfirmed: (transactionHash) => {
              if (!isCurrentRun()) return;
              actions.markBundleConfirmed(transactionHash);
              markAllSteps('confirmed', transactionHash);
            },
            onApprovalSubmitted: (index) => {
              if (!isCurrentRun()) return;
              updateStep(index, { status: 'submitted' });
            },
            onApprovalConfirmed: (index, _tx, hash) => {
              if (!isCurrentRun()) return;
              updateStep(index, { status: 'confirmed', txHash: hash });
            },
            onCallSubmitted: (index) => {
              if (!isCurrentRun()) return;
              updateStep(plan.approvals.length + index, {
                status: 'submitted',
              });
            },
            onCallConfirmed: (index, _tx, hash) => {
              if (!isCurrentRun()) return;
              updateStep(plan.approvals.length + index, {
                status: 'confirmed',
                txHash: hash,
              });
            },
          });

          return isCurrentRun()
            ? actions.applyExecutionResult(execution)
            : execution;
        },
        (error) => gmxDepositLogger.error('[gmx-deposit] failed:', error),
      );
    },
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
