import { extractErrorMessage } from '@core/lib/errors';
import {
  executeDepositPlanWithWallet,
  isEIP7702WalletRecoveryError,
} from '@core/lib/wallet/executeDepositPlan';
import { useWalletProvider } from '@core/providers/walletContext';
import { getDepositPlan } from '@core/services/planOrchestrationService';
import type { DepositPlan } from '@zapengine/types/api';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Address } from 'viem';

import {
  assertPlannedAccount,
  assertSingleChainPlan,
  assertSingleChainPreflight,
  assertSupportedSingleChainRequest,
  copySingleChainDepositRequest,
  readSingleChainPositionBalance,
  waitForSingleChainPositionIncrease,
} from './singleChainDepositExecution';
import {
  initialSingleChainDepositWizardState,
  requestChainId,
  type SingleChainDepositRequest,
  singleChainDepositWizardReducer,
  type SingleChainDepositWizardState,
} from './singleChainDepositMachine';

export type {
  SingleChainDepositRecovery,
  SingleChainDepositRequest,
  SingleChainDepositWizardState,
  SingleChainDepositWizardStep,
  SingleChainDepositWizardStepKind,
  SingleChainDepositWizardStepStatus,
} from './singleChainDepositMachine';
export {
  initialSingleChainDepositWizardState,
  singleChainDepositWizardReducer,
} from './singleChainDepositMachine';

const DEPOSIT_PLAN_LABEL = 'deposit plan';

export interface SingleChainDepositWizard {
  wizard: SingleChainDepositWizardState;
  pending: boolean;
  start: (input: SingleChainDepositRequest) => Promise<void>;
  advance: () => Promise<void>;
  retry: () => void;
  reset: () => void;
}

/**
 * Executes one single-chain protocol deposit as one wallet batch, then verifies
 * the resulting protocol position. `start` freezes and previews the exact
 * request. The first `advance` refreshes and submits it; the second only polls
 * settlement, so a submitted batch can never be duplicated by Retry.
 */
export function useSingleChainDepositWizard(): SingleChainDepositWizard {
  const wallet = useWalletProvider();
  const [wizard, dispatch] = useReducer(
    singleChainDepositWizardReducer,
    initialSingleChainDepositWizardState,
  );
  const requestRef = useRef<SingleChainDepositRequest | null>(null);
  const planRef = useRef<DepositPlan | null>(null);
  const positionBaselineRef = useRef<bigint | null>(null);
  const batchSubmittedRef = useRef(false);
  const advanceInFlightRef = useRef(false);
  /* jscpd:ignore-start -- lifecycle refs intentionally mirror the strategy wizard */
  const generationRef = useRef(0);
  const walletRef = useRef(wallet);

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);
  /* jscpd:ignore-end */

  const start = useCallback(async (input: SingleChainDepositRequest) => {
    const request = copySingleChainDepositRequest(input);
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    requestRef.current = request;
    planRef.current = null;
    positionBaselineRef.current = null;
    batchSubmittedRef.current = false;
    advanceInFlightRef.current = false;
    dispatch({ type: 'PREPARE_STARTED', request });

    try {
      assertSupportedSingleChainRequest(request);
      const plan = await getDepositPlan(request);
      assertSingleChainPlan(plan, request);
      if (generation !== generationRef.current) return;

      planRef.current = plan;
      dispatch({ type: 'PLAN_LOADED', plan });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    } catch (error) {
      if (generation === generationRef.current) {
        dispatch({
          type: 'PLAN_LOAD_FAILED',
          message: extractErrorMessage(error, 'Unable to prepare deposit plan'),
        });
      }
      throw error;
    }
  }, []);

  const executeBatch = useCallback(
    async (request: SingleChainDepositRequest, generation: number) => {
      const address = request.userAddress as Address;
      const chainId = requestChainId(request);
      dispatch({ type: 'BATCH_STARTED' });

      try {
        assertPlannedAccount(
          walletRef.current.account?.address,
          address,
          DEPOSIT_PLAN_LABEL,
        );
        const refreshedPlan = await getDepositPlan(request);
        assertSingleChainPlan(refreshedPlan, request);
        if (generation !== generationRef.current) return;
        dispatch({ type: 'PLAN_REFRESHED', plan: refreshedPlan });

        assertPlannedAccount(
          walletRef.current.account?.address,
          address,
          DEPOSIT_PLAN_LABEL,
        );
        if (walletRef.current.chain?.id !== chainId) {
          await walletRef.current.switchChain(chainId);
        }
        assertPlannedAccount(
          walletRef.current.account?.address,
          address,
          DEPOSIT_PLAN_LABEL,
        );
        await assertSingleChainPreflight({
          request,
          plan: refreshedPlan,
          address,
        });
        positionBaselineRef.current = await readSingleChainPositionBalance(
          request,
          address,
        );
        assertPlannedAccount(
          walletRef.current.account?.address,
          address,
          DEPOSIT_PLAN_LABEL,
        );
        if (generation !== generationRef.current) return;

        const activeWallet = walletRef.current;
        const execution = await executeDepositPlanWithWallet({
          plan: refreshedPlan,
          chainId,
          getWalletClient: activeWallet.getWalletClient,
          ...(activeWallet.externalWalletBrand
            ? { externalWalletBrand: activeWallet.externalWalletBrand }
            : {}),
          ...(activeWallet.executeAtomicBatch
            ? { executeAtomicBatch: activeWallet.executeAtomicBatch }
            : {}),
          onBundleSubmitted: (callsId) => {
            batchSubmittedRef.current = true;
            if (generation === generationRef.current) {
              dispatch({ type: 'BATCH_SUBMITTED', callsId });
            }
          },
          onBundleConfirmed: (transactionHash) => {
            if (generation === generationRef.current) {
              dispatch({
                type: 'BATCH_CONFIRMED',
                ...(transactionHash ? { transactionHash } : {}),
              });
            }
          },
        });
        if (execution.kind === 'eip7702') {
          batchSubmittedRef.current = true;
        }
        if (generation !== generationRef.current) return;

        const transactionHash =
          execution.kind === 'eip7702'
            ? execution.transactionHash
            : execution.hashes.at(-1);
        dispatch({
          type: 'BATCH_COMPLETED',
          ...(execution.kind === 'eip7702'
            ? { callsId: execution.callsId }
            : {}),
          ...(transactionHash ? { transactionHash } : {}),
        });
      } catch (error) {
        if (generation === generationRef.current) {
          dispatch({
            type: 'BATCH_FAILED',
            message: extractErrorMessage(error, 'Deposit batch failed'),
            submitted: batchSubmittedRef.current,
            recovery: isEIP7702WalletRecoveryError(error)
              ? 'wallet-delegation'
              : null,
          });
        }
      }
    },
    [],
  );

  const verifySettlement = useCallback(
    async (request: SingleChainDepositRequest, generation: number) => {
      dispatch({ type: 'SETTLEMENT_STARTED' });
      try {
        const address = request.userAddress as Address;
        assertPlannedAccount(
          walletRef.current.account?.address,
          address,
          DEPOSIT_PLAN_LABEL,
        );
        const baseline = positionBaselineRef.current;
        if (baseline === null) {
          throw new Error('Position baseline is unavailable.');
        }
        await waitForSingleChainPositionIncrease({
          request,
          address,
          baseline,
        });
        if (generation === generationRef.current) {
          dispatch({ type: 'SETTLEMENT_CONFIRMED' });
        }
      } catch (error) {
        if (generation === generationRef.current) {
          dispatch({
            type: 'SETTLEMENT_FAILED',
            message: extractErrorMessage(
              error,
              'Unable to verify protocol settlement',
            ),
          });
        }
      }
    },
    [],
  );

  const advance = useCallback(async () => {
    const request = requestRef.current;
    const currentIndex =
      wizard.currentIndex === 0 && planRef.current !== null
        ? 1
        : wizard.currentIndex;
    const stepKind =
      wizard.steps[currentIndex]?.kind ??
      (planRef.current !== null ? ('batch' as const) : undefined);
    if (
      !request ||
      !stepKind ||
      wizard.status === 'busy' ||
      advanceInFlightRef.current
    ) {
      return;
    }

    const generation = generationRef.current;
    advanceInFlightRef.current = true;
    try {
      if (stepKind === 'batch') {
        await executeBatch(request, generation);
      } else if (stepKind === 'settlement') {
        await verifySettlement(request, generation);
      }
    } finally {
      advanceInFlightRef.current = false;
    }
  }, [executeBatch, verifySettlement, wizard]);

  const retry = useCallback(() => dispatch({ type: 'RETRY' }), []);

  /* jscpd:ignore-start -- reset invalidates single-chain-only refs before the shared hook result */
  const reset = useCallback(() => {
    generationRef.current += 1;
    requestRef.current = null;
    planRef.current = null;
    positionBaselineRef.current = null;
    batchSubmittedRef.current = false;
    advanceInFlightRef.current = false;
    dispatch({ type: 'RESET' });
  }, []);

  return {
    wizard,
    pending: wizard.status === 'busy',
    start,
    advance,
    retry,
    reset,
  };
  /* jscpd:ignore-end */
}
