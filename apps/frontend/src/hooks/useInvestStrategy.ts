import type {
  DepositLeg,
  DepositPlan,
  PermitRequest,
  PreparedTransaction,
} from '@zapengine/types/api';
import { useCallback, useState } from 'react';
import type { Account, Address, Hash, Hex } from 'viem';
import { base } from 'viem/chains';

import { useWalletProvider } from '@/providers/WalletProvider';
import { getDepositPlan } from '@/services/depositService';
import {
  getBridgeStatus,
  getPublicClient,
  intentEngine,
} from '@/services/intentClient';
import type { WalletTypedData } from '@/types';
import { logger } from '@/utils/logger';

export type InvestExecutionTier =
  | 'eip7702'
  | 'permit-multicall3'
  | 'sequential';

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
  | { kind: 'permit-multicall3'; hash: Hash }
  | { kind: 'sequential'; hashes: Hash[] };

interface RunInvestStrategyInput {
  fromToken: Address;
  fromAmount: string;
  sourceChainId?: number;
}

const investStrategyLogger = logger.createContextLogger('InvestStrategy');

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toWalletTypedData(permit: PermitRequest): WalletTypedData {
  return {
    domain: permit.typedData.domain,
    types: {
      Permit: permit.typedData.types.Permit,
    },
    primaryType: permit.typedData.primaryType,
    message: {
      ...permit.typedData.message,
      value: BigInt(permit.typedData.message.value),
      nonce: BigInt(permit.typedData.message.nonce),
      deadline: BigInt(permit.typedData.message.deadline),
    },
  };
}

function txRequest(tx: PreparedTransaction, account: Account) {
  return {
    account,
    to: tx.to as Address,
    data: tx.data as Hex,
    value: BigInt(tx.value),
    chainId: tx.chainId,
    ...(tx.gasLimit ? { gas: BigInt(tx.gasLimit) } : {}),
  };
}

function initialLegProgress(plan: DepositPlan): InvestLegProgress[] {
  return plan.legs.map((leg) => ({
    chainId: leg.chainId,
    kind: leg.kind,
    status: 'pending',
  }));
}

export function useInvestStrategy() {
  const { account, chain, getWalletClient, signTypedData } =
    useWalletProvider();
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

        if (sourceChainId !== base.id || chain?.id !== base.id) {
          throw new Error(
            'Connect to Base - Ethereum/Arbitrum legs route through Base in v1',
          );
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

        if (strategy === 'multicall3' && plan.permitRequest) {
          investStrategyLogger.info(
            '[invest-strategy] executing Permit + Multicall3',
          );
          const signature = await signTypedData(
            toWalletTypedData(plan.permitRequest),
          );
          const permitTx = intentEngine.execution.permit.encodePermitCall(
            plan.permitRequest.token as Address,
            {
              ...plan.permitRequest,
              signature: signature as Hex,
            },
          );

          const batchedTx =
            intentEngine.execution.permit.wrapPermitAndCallsInMulticall3(
              permitTx,
              plan.calls,
            );
          const hash = await sendPreparedTransaction(batchedTx);

          setTier('permit-multicall3');
          setLastTxHash(hash);
          setLastTxHashes([hash]);
          setLegs((current) =>
            current.map((leg) => ({
              ...leg,
              sourceTxHash: hash,
              status: 'sourceConfirmed',
            })),
          );
          for (const [index, leg] of plan.legs.entries()) {
            if (leg.kind === 'bridge') {
              void pollBridgeStatus(leg, hash, index);
            }
          }
          return { kind: 'permit-multicall3', hash };
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
      sendPreparedTransaction,
      signTypedData,
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
    getErrorMessage,
  };
}
