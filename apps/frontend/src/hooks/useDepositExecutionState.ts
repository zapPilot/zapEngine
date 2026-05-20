import type { DepositPlan } from '@zapengine/types/api';
import { useCallback, useMemo, useState } from 'react';
import type { Address, Hash } from 'viem';

import { extractErrorMessage } from '@/lib/errors';
import type {
  DepositExecutionTier,
  DepositPlanExecutionResult,
} from '@/lib/wallet/executeDepositPlan';

/**
 * Resolves the connected wallet address, throwing the canonical
 * "connect wallet" error when absent. Takes the address (not the account
 * object) so callers keep `account?.address` as a stable memo dependency.
 */
export function requireUserAddress(address: string | undefined): Address {
  if (!address) {
    throw new Error('Connect wallet first');
  }
  return address as Address;
}

export async function ensureChain(
  currentChainId: number | undefined,
  targetChainId: number,
  switchChain: (chainId: number) => Promise<void>,
): Promise<void> {
  if (currentChainId !== targetChainId) {
    await switchChain(targetChainId);
  }
}

export interface DepositExecutionState {
  pending: boolean;
  lastError: unknown;
  tier: DepositExecutionTier | null;
  lastTxHash: Hash | null;
  lastTxHashes: Hash[];
  lastCallsId: string | null;
  lastPlan: DepositPlan | null;
  getErrorMessage: (error: unknown) => string;
}

export interface DepositExecutionActions {
  /**
   * Wraps the begin → try → catch → finally lifecycle: resets state,
   * runs `execute`, and on failure calls `onError` (per-hook logging),
   * records the error, and rethrows. `pending` is always cleared.
   */
  run: <T>(
    execute: () => Promise<T>,
    onError: (error: unknown) => void,
  ) => Promise<T>;
  setLastPlan: (plan: DepositPlan) => void;
  markBundleSubmitted: (callsId: string) => void;
  markBundleConfirmed: (transactionHash?: Hash) => void;
  applyExecutionResult: (
    execution: DepositPlanExecutionResult,
  ) => DepositPlanExecutionResult;
}

/**
 * Shared state machine for deposit-style execution hooks
 * (`useGmxDeposit`, `useInvestStrategy`). Owns the common
 * pending/error/tier/tx-hash/plan state plus the lifecycle helpers; the
 * concrete hooks layer their own progress model (steps vs legs) on top.
 *
 * Returns `{ state, actions }` so consumers spread `state` into their
 * public surface and depend on the single stable `actions` reference,
 * keeping the wiring out of each hook.
 */
export function useDepositExecutionState(): {
  state: DepositExecutionState;
  actions: DepositExecutionActions;
} {
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<unknown>(null);
  const [tier, setTier] = useState<DepositExecutionTier | null>(null);
  const [lastTxHash, setLastTxHash] = useState<Hash | null>(null);
  const [lastTxHashes, setLastTxHashes] = useState<Hash[]>([]);
  const [lastCallsId, setLastCallsId] = useState<string | null>(null);
  const [lastPlan, setLastPlan] = useState<DepositPlan | null>(null);

  const run = useCallback(
    async <T>(
      execute: () => Promise<T>,
      onError: (error: unknown) => void,
    ): Promise<T> => {
      setPending(true);
      setLastError(null);
      setTier(null);
      setLastTxHash(null);
      setLastTxHashes([]);
      setLastCallsId(null);
      setLastPlan(null);

      try {
        return await execute();
      } catch (error) {
        onError(error);
        setLastError(error);
        throw error;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const markBundleSubmitted = useCallback((callsId: string) => {
    setTier('eip7702');
    setLastCallsId(callsId);
  }, []);

  const markBundleConfirmed = useCallback((transactionHash?: Hash) => {
    setLastTxHash(transactionHash ?? null);
  }, []);

  const applyExecutionResult = useCallback(
    (execution: DepositPlanExecutionResult): DepositPlanExecutionResult => {
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
    },
    [],
  );

  const actions = useMemo<DepositExecutionActions>(
    () => ({
      run,
      setLastPlan,
      markBundleSubmitted,
      markBundleConfirmed,
      applyExecutionResult,
    }),
    [run, markBundleSubmitted, markBundleConfirmed, applyExecutionResult],
  );

  const state: DepositExecutionState = {
    pending,
    lastError,
    tier,
    lastTxHash,
    lastTxHashes,
    lastCallsId,
    lastPlan,
    getErrorMessage: (error: unknown) =>
      extractErrorMessage(error, 'Unexpected error'),
  };

  return { state, actions };
}
