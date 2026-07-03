import { useAbortControllerRef } from '@core/hooks/useAbortControllerRef';
import { useDepositExecutionState } from '@core/hooks/useDepositExecutionState';
import { executeDepositPlanWithWallet } from '@core/lib/wallet/executeDepositPlan';
import { loadBaseInvestPlan } from '@core/lib/wallet/loadBaseInvestPlan';
import { useWalletProvider } from '@core/providers/WalletProvider';
import { waitForBridgeCompletion } from '@core/services/intentClient';
import { logger } from '@core/utils/logger';
import type { DepositLeg, DepositPlan } from '@zapengine/types/api';
import { useCallback, useState } from 'react';
import type { Address, Hash } from 'viem';
import { base } from 'viem/chains';

export type InvestLegStatus =
  | 'pending'
  | 'submitted'
  | 'sourceConfirmed'
  | 'bridgePending'
  | 'destinationConfirmed'
  | 'failed';

export interface InvestLegProgress {
  chainId: number;
  kind: DepositLeg['kind'];
  status: InvestLegStatus;
  sourceTxHash?: Hash;
  destinationTxHash?: Hash;
}

export type InvestStrategyResult =
  | { kind: 'eip7702'; callsId: string }
  | { kind: 'sequential'; hashes: Hash[] };

interface RunInvestStrategyInput {
  fromToken: Address;
  fromAmount: string;
  sourceChainId?: number;
}

const investStrategyLogger = logger.createContextLogger('InvestStrategy');

function legProgress(
  plan: DepositPlan,
  status: InvestLegStatus,
): InvestLegProgress[] {
  return plan.legs.map((leg) => ({
    chainId: leg.chainId,
    kind: leg.kind,
    status,
  }));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useInvestStrategy() {
  const { account, chain, executeAtomicBatch, getWalletClient, switchChain } =
    useWalletProvider();
  const { state, actions } = useDepositExecutionState();
  const [legs, setLegs] = useState<InvestLegProgress[]>([]);
  const { ref: abortRef, renew: renewAbort } = useAbortControllerRef();

  const updateLeg = useCallback(
    (index: number, patch: Partial<InvestLegProgress>) => {
      setLegs((current) =>
        current.map((leg, legIndex) =>
          legIndex === index ? { ...leg, ...patch } : leg,
        ),
      );
    },
    [],
  );

  const pollBridgeStatus = useCallback(
    async (leg: DepositLeg, sourceTxHash: Hash, index: number) => {
      if (leg.kind !== 'bridge') return;

      updateLeg(index, { status: 'bridgePending', sourceTxHash });

      try {
        const status = await waitForBridgeCompletion({
          txHash: sourceTxHash,
          fromChain: base.id,
          toChain: leg.chainId,
          ...(abortRef.current ? { signal: abortRef.current.signal } : {}),
        });
        updateLeg(index, {
          status: 'destinationConfirmed',
          ...(status.receiving?.txHash
            ? { destinationTxHash: status.receiving.txHash }
            : {}),
        });
      } catch (error) {
        if (isAbortError(error)) return;
        investStrategyLogger.error(
          '[invest-strategy] bridge status failed:',
          error,
        );
        updateLeg(index, { status: 'failed' });
      }
    },
    [abortRef, updateLeg],
  );

  const markAllCallsSubmitted = useCallback((plan: DepositPlan) => {
    setLegs(legProgress(plan, 'submitted'));
  }, []);

  const run = useCallback(
    async ({
      fromToken,
      fromAmount,
      sourceChainId = base.id,
    }: RunInvestStrategyInput): Promise<InvestStrategyResult> =>
      actions.run(
        async () => {
          setLegs([]);
          renewAbort();

          if (sourceChainId !== base.id) {
            throw new Error(
              'Connect to Base - Ethereum/Arbitrum legs route through Base in v1',
            );
          }

          const { plan } = await loadBaseInvestPlan(
            { account, chain, switchChain },
            { fromAmount, fromToken },
          );
          actions.setLastPlan(plan);
          setLegs(legProgress(plan, 'pending'));

          const execution = await executeDepositPlanWithWallet({
            plan,
            chainId: sourceChainId,
            getWalletClient,
            ...(executeAtomicBatch ? { executeAtomicBatch } : {}),
            onBundleSubmitted: (callsId) => {
              investStrategyLogger.info('[invest-strategy] executing EIP-7702');
              actions.markBundleSubmitted(callsId);
              markAllCallsSubmitted(plan);
            },
            onBundleConfirmed: (transactionHash) => {
              actions.markBundleConfirmed(transactionHash);
            },
            onCallSubmitted: (index) => {
              updateLeg(index, { status: 'submitted' });
            },
            onCallConfirmed: (index, _tx, hash) => {
              updateLeg(index, {
                status: 'sourceConfirmed',
                sourceTxHash: hash,
              });
              const leg = plan.legs[index];
              if (leg?.kind === 'bridge') {
                void pollBridgeStatus(leg, hash, index);
              }
            },
          });

          if (execution.kind === 'sequential') {
            investStrategyLogger.info(
              '[invest-strategy] executing sequentially',
            );
          }
          return actions.applyExecutionResult(execution);
        },
        (error) =>
          investStrategyLogger.error('[invest-strategy] failed:', error),
      ),
    [
      account,
      chain,
      executeAtomicBatch,
      getWalletClient,
      switchChain,
      markAllCallsSubmitted,
      pollBridgeStatus,
      renewAbort,
      updateLeg,
      actions,
    ],
  );

  return {
    run,
    ...state,
    legs,
  };
}
