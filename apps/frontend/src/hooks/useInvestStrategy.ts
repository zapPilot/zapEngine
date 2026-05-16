import type {
  DepositLeg,
  DepositPlan,
  PreparedTransaction,
} from '@zapengine/types/api';
import { useCallback, useState } from 'react';
import type { Address, Hash } from 'viem';
import { base } from 'viem/chains';

import { extractErrorMessage } from '@/lib/errors';
import { txRequest } from '@/lib/wallet/txRequest';
import { useWalletProvider } from '@/providers/WalletProvider';
import { getDepositPlan } from '@/services/depositService';
import {
  getBridgeStatus,
  getPublicClient,
  intentEngine,
} from '@/services/intentClient';
import { logger } from '@/utils/logger';

export type InvestExecutionTier = 'eip7702' | 'sequential';

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

function initialLegProgress(plan: DepositPlan): InvestLegProgress[] {
  return plan.legs.map((leg) => ({
    chainId: leg.chainId,
    kind: leg.kind,
    status: 'pending',
  }));
}

export function useInvestStrategy() {
  const { account, chain, getWalletClient, switchChain } = useWalletProvider();
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<unknown>(null);
  const [tier, setTier] = useState<InvestExecutionTier | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);
  const [lastTxHashes, setLastTxHashes] = useState<Hash[]>([]);
  const [lastCallsId, setLastCallsId] = useState<string | null>(null);
  const [lastPlan, setLastPlan] = useState<DepositPlan | null>(null);
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

  const sendPreparedTransaction = useCallback(
    async (tx: PreparedTransaction): Promise<Hash> => {
      const walletClient = await getWalletClient();
      if (!walletClient.account) {
        throw new Error('Wallet client has no connected account');
      }

      return walletClient.sendTransaction(txRequest(tx, walletClient.account));
    },
    [getWalletClient],
  );

  const sendAndWait = useCallback(
    async (tx: PreparedTransaction): Promise<Hash> => {
      const hash = await sendPreparedTransaction(tx);
      await getPublicClient(tx.chainId).waitForTransactionReceipt({ hash });
      return hash;
    },
    [sendPreparedTransaction],
  );

  const markAllCallsSubmitted = useCallback((plan: DepositPlan) => {
    setLegs(
      plan.legs.map((leg) => ({
        chainId: leg.chainId,
        kind: leg.kind,
        status: 'submitted',
      })),
    );
  }, []);

  const run = useCallback(
    async ({
      fromToken,
      fromAmount,
      sourceChainId = base.id,
    }: RunInvestStrategyInput): Promise<InvestStrategyResult> => {
      setPending(true);
      setLastError(null);
      setTier(null);
      setLastTxHash(null);
      setLastTxHashes([]);
      setLastCallsId(null);
      setLastPlan(null);
      setLegs([]);

      try {
        const userAddress = account?.address as Address | undefined;
        if (!userAddress) {
          throw new Error('Connect wallet first');
        }

        if (sourceChainId !== base.id) {
          throw new Error(
            'Connect to Base - Ethereum/Arbitrum legs route through Base in v1',
          );
        }

        if (chain?.id !== base.id) {
          await switchChain(base.id);
        }

        const plan = await getDepositPlan({
          userAddress,
          fromToken,
          fromAmount,
          sourceChainId,
        });
        setLastPlan(plan);
        setLegs(initialLegProgress(plan));

        const walletClient = await getWalletClient();
        const strategy = await intentEngine.getExecutionStrategy(
          walletClient,
          sourceChainId,
        );

        if (strategy === 'eip7702') {
          investStrategyLogger.info('[invest-strategy] executing EIP-7702');
          const result = await intentEngine.executeWithEIP7702(
            [...plan.approvals, ...plan.calls],
            walletClient,
          );
          if (!result.success || !result.callsId) {
            throw new Error(
              result.error ??
                'EIP-7702 batch failed to return a calls bundle id',
            );
          }

          setTier('eip7702');
          setLastCallsId(result.callsId);
          markAllCallsSubmitted(plan);
          return { kind: 'eip7702', callsId: result.callsId };
        }

        investStrategyLogger.info('[invest-strategy] executing sequentially');
        const hashes: Hash[] = [];
        for (const tx of plan.approvals) {
          hashes.push(await sendAndWait(tx));
        }

        for (const [index, tx] of plan.calls.entries()) {
          updateLeg(index, { status: 'submitted' });
          const hash = await sendAndWait(tx);
          hashes.push(hash);
          updateLeg(index, { status: 'sourceConfirmed', sourceTxHash: hash });
          const leg = plan.legs[index];
          if (leg?.kind === 'bridge') {
            void pollBridgeStatus(leg, hash, index);
          }
        }

        setTier('sequential');
        setLastTxHash(hashes.at(-1) ?? null);
        setLastTxHashes(hashes);
        return { kind: 'sequential', hashes };
      } catch (error) {
        investStrategyLogger.error('[invest-strategy] failed:', error);
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
      markAllCallsSubmitted,
      pollBridgeStatus,
      sendAndWait,
      switchChain,
      updateLeg,
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
    legs,
    getErrorMessage: (error: unknown) =>
      extractErrorMessage(error, 'Unexpected error'),
  };
}
