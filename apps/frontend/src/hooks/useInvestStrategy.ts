import type { DepositLeg, DepositPlan } from '@zapengine/types/api';
import { useCallback, useState } from 'react';
import type { Address, Hash } from 'viem';
import { base } from 'viem/chains';

import {
  ensureChain,
  requireUserAddress,
  useDepositExecutionState,
} from '@/hooks/useDepositExecutionState';
import { executeDepositPlan } from '@/lib/wallet/executeDepositPlan';
import { useWalletProvider } from '@/providers/WalletProvider';
import { getBridgeStatus } from '@/services/intentClient';
import { getDepositPlan } from '@/services/planOrchestrationService';
import { logger } from '@/utils/logger';

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

export function useInvestStrategy() {
  const { account, chain, getWalletClient, switchChain } = useWalletProvider();
  const { state, actions } = useDepositExecutionState();
  const [legs, setLegs] = useState<InvestLegProgress[]>([]);

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
        const status = await getBridgeStatus({
          txHash: sourceTxHash,
          fromChain: base.id,
          toChain: leg.chainId,
        });
        if (status.status === 'DONE') {
          updateLeg(index, {
            status: 'destinationConfirmed',
            ...(status.receiving?.txHash
              ? { destinationTxHash: status.receiving.txHash }
              : {}),
          });
        }
      } catch (error) {
        investStrategyLogger.error(
          '[invest-strategy] bridge status failed:',
          error,
        );
      }
    },
    [updateLeg],
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

          const userAddress = requireUserAddress(account?.address);

          if (sourceChainId !== base.id) {
            throw new Error(
              'Connect to Base - Ethereum/Arbitrum legs route through Base in v1',
            );
          }

          await ensureChain(chain?.id, base.id, switchChain);

          const plan = await getDepositPlan({
            kind: 'invest',
            userAddress,
            fromToken,
            fromAmount,
            sourceChainId,
          });
          actions.setLastPlan(plan);
          setLegs(legProgress(plan, 'pending'));

          const walletClient = await getWalletClient(base.id);
          const execution = await executeDepositPlan({
            plan,
            walletClient,
            chainId: sourceChainId,
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
      account?.address,
      chain?.id,
      getWalletClient,
      switchChain,
      markAllCallsSubmitted,
      pollBridgeStatus,
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
