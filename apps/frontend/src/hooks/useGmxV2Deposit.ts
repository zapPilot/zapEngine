import type {
  GmxV2MarketKey,
  GmxV2SupplyPlan,
  PreparedTransaction,
} from '@zapengine/intent-engine';
import { useCallback, useState } from 'react';
import type { Address, Hash } from 'viem';
import { arbitrum } from 'viem/chains';

import { extractErrorMessage } from '@/lib/errors';
import { txRequest } from '@/lib/wallet/txRequest';
import { useWalletProvider } from '@/providers/WalletProvider';
import { buildGmxV2Deposit, getPublicClient } from '@/services/intentClient';
import { logger } from '@/utils/logger';

export type GmxV2DepositStepStatus = 'pending' | 'submitted' | 'confirmed';

export interface GmxV2DepositStepProgress {
  index: number;
  label: string;
  status: GmxV2DepositStepStatus;
  txHash?: Hash;
}

interface RunGmxV2DepositInput {
  marketKey: GmxV2MarketKey;
  amount: string;
}

export interface GmxV2DepositResult {
  hashes: Hash[];
}

const gmxV2DepositLogger = logger.createContextLogger('GmxV2Deposit');

function initialSteps(plan: GmxV2SupplyPlan): GmxV2DepositStepProgress[] {
  return [...plan.approvals, ...plan.steps].map((tx, index) => ({
    index,
    label:
      tx.meta.intentType === 'APPROVAL'
        ? 'Approval'
        : tx.meta.intentType === 'SWAP'
          ? 'Swap'
          : 'GMX deposit',
    status: 'pending',
  }));
}

export function useGmxV2Deposit() {
  const { account, chain, getWalletClient, switchChain } = useWalletProvider();
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<unknown>(null);
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);
  const [lastTxHashes, setLastTxHashes] = useState<Hash[]>([]);
  const [lastPlan, setLastPlan] = useState<GmxV2SupplyPlan | null>(null);
  const [steps, setSteps] = useState<GmxV2DepositStepProgress[]>([]);

  const updateStep = useCallback(
    (index: number, patch: Partial<GmxV2DepositStepProgress>) => {
      setSteps((current) =>
        current.map((step) =>
          step.index === index ? { ...step, ...patch } : step,
        ),
      );
    },
    [],
  );

  const sendAndWait = useCallback(
    async (tx: PreparedTransaction): Promise<Hash> => {
      const walletClient = await getWalletClient();
      if (!walletClient.account) {
        throw new Error('Wallet client has no connected account');
      }

      const hash = await walletClient.sendTransaction(
        txRequest(tx, walletClient.account),
      );
      await getPublicClient(tx.chainId).waitForTransactionReceipt({ hash });
      return hash;
    },
    [getWalletClient],
  );

  const run = useCallback(
    async ({
      marketKey,
      amount,
    }: RunGmxV2DepositInput): Promise<GmxV2DepositResult> => {
      setPending(true);
      setLastError(null);
      setLastTxHash(null);
      setLastTxHashes([]);
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

        const plan = await buildGmxV2Deposit({
          marketKey,
          amount,
          userAddress,
        });
        setLastPlan(plan);
        setSteps(initialSteps(plan));

        const hashes: Hash[] = [];
        const txs = [...plan.approvals, ...plan.steps];
        for (const [index, tx] of txs.entries()) {
          updateStep(index, { status: 'submitted' });
          const hash = await sendAndWait(tx);
          hashes.push(hash);
          updateStep(index, { status: 'confirmed', txHash: hash });
        }

        setLastTxHash(hashes.at(-1) ?? null);
        setLastTxHashes(hashes);
        return { hashes };
      } catch (error) {
        gmxV2DepositLogger.error('[gmx-v2-deposit] failed:', error);
        setLastError(error);
        throw error;
      } finally {
        setPending(false);
      }
    },
    [account?.address, chain?.id, sendAndWait, switchChain, updateStep],
  );

  return {
    run,
    pending,
    lastError,
    lastTxHash,
    lastTxHashes,
    lastPlan,
    steps,
    getErrorMessage: (error: unknown) =>
      extractErrorMessage(error, 'Unexpected error'),
  };
}
