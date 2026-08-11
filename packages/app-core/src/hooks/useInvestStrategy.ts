import { useAbortControllerRef } from '@core/hooks/useAbortControllerRef';
import { useDepositExecutionState } from '@core/hooks/useDepositExecutionState';
import { executeDepositPlanWithWallet } from '@core/lib/wallet/executeDepositPlan';
import { loadBaseInvestPlan } from '@core/lib/wallet/loadBaseInvestPlan';
import { useWalletProvider } from '@core/providers/walletContext';
import { waitForBridgeCompletion } from '@core/services/intentClient';
import { logger } from '@core/utils/logger';
import type { BridgeProviderId } from '@zapengine/intent-engine';
import type { DepositLeg, DepositPlan } from '@zapengine/types/api';
import { useCallback, useRef, useState } from 'react';
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
  const wallet = useWalletProvider();
  const { state, actions } = useDepositExecutionState();
  const [legs, setLegs] = useState<InvestLegProgress[]>([]);
  const { ref: abortRef, renew: renewAbort } = useAbortControllerRef();
  const runIdRef = useRef(0);

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
    async (
      leg: DepositLeg,
      sourceTxHash: Hash,
      index: number,
      runId: number,
    ) => {
      if (leg.kind !== 'bridge' || runId !== runIdRef.current) return;

      updateLeg(index, { status: 'bridgePending', sourceTxHash });

      try {
        if (!leg.bridge) throw new Error('Bridge leg is missing its provider');
        const status = await waitForBridgeCompletion({
          provider: leg.bridge as BridgeProviderId,
          txHash: sourceTxHash,
          fromChain: base.id,
          toChain: leg.chainId,
          ...(abortRef.current ? { signal: abortRef.current.signal } : {}),
        });
        if (runId !== runIdRef.current) return;
        updateLeg(index, {
          status: 'destinationConfirmed',
          ...(status.destinationTxHash
            ? { destinationTxHash: status.destinationTxHash }
            : {}),
        });
      } catch (error) {
        if (isAbortError(error) || runId !== runIdRef.current) return;
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
    }: RunInvestStrategyInput): Promise<InvestStrategyResult> => {
      const runId = ++runIdRef.current;
      const isCurrentRun = () => runId === runIdRef.current;

      return actions.run(
        async () => {
          setLegs([]);
          renewAbort();

          if (sourceChainId !== base.id) {
            throw new Error(
              'Connect to Base - Ethereum/Arbitrum legs route through Base in v1',
            );
          }

          const planResult = await loadBaseInvestPlan(
            {
              account: wallet.account,
              chain: wallet.chain,
              switchChain: wallet.switchChain,
            },
            { fromAmount, fromToken },
          );
          const plan = planResult.plan;
          if (!isCurrentRun()) {
            throw new DOMException(
              'Superseded by a newer invest run',
              'AbortError',
            );
          }
          actions.setLastPlan(plan);
          setLegs(legProgress(plan, 'pending'));

          const walletExecution = {
            getWalletClient: wallet.getWalletClient,
            ...(wallet.externalWalletBrand
              ? { externalWalletBrand: wallet.externalWalletBrand }
              : {}),
            ...(wallet.executeAtomicBatch
              ? { executeAtomicBatch: wallet.executeAtomicBatch }
              : {}),
          };
          const execution = await executeDepositPlanWithWallet({
            plan,
            chainId: sourceChainId,
            ...walletExecution,
            onBundleSubmitted: (callsId) => {
              if (!isCurrentRun()) return;
              investStrategyLogger.info('[invest-strategy] executing EIP-7702');
              actions.markBundleSubmitted(callsId);
              markAllCallsSubmitted(plan);
            },
            onBundleConfirmed: (transactionHash) => {
              if (!isCurrentRun()) return;
              actions.markBundleConfirmed(transactionHash);
            },
            onCallSubmitted: (index) => {
              if (!isCurrentRun()) return;
              updateLeg(index, { status: 'submitted' });
            },
            onCallConfirmed: (index, _tx, hash) => {
              if (!isCurrentRun()) return;
              updateLeg(index, {
                status: 'sourceConfirmed',
                sourceTxHash: hash,
              });
              const leg = plan.legs[index];
              if (leg?.kind === 'bridge') {
                void pollBridgeStatus(leg, hash, index, runId);
              }
            },
          });

          if (execution.kind === 'sequential' && isCurrentRun()) {
            investStrategyLogger.info(
              '[invest-strategy] executing sequentially',
            );
          }
          return isCurrentRun()
            ? actions.applyExecutionResult(execution)
            : execution;
        },
        (error) => {
          if (!isAbortError(error)) {
            investStrategyLogger.error('[invest-strategy] failed:', error);
          }
        },
      );
    },
    [
      wallet.account,
      wallet.chain,
      wallet.executeAtomicBatch,
      wallet.externalWalletBrand,
      wallet.getWalletClient,
      wallet.switchChain,
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
