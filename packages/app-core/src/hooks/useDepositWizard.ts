import { useAbortControllerRef } from '@core/hooks/useAbortControllerRef';
import { extractErrorMessage } from '@core/lib/errors';
import { isAbortError } from '@core/lib/http';
import {
  depositWizardReducer,
  type DepositWizardState,
  hlpStepFromPlan,
  initialDepositWizardState,
  resolveHlpDepositUsd6,
  type WizardLegStatus,
} from '@core/lib/wallet/depositWizardMachine';
import { useWalletProvider } from '@core/providers/walletContext';
import {
  getVaultEquity,
  HyperliquidVaultDepositError,
  submitVaultDeposit,
  waitForPerpUsdcArrival,
  waitForVaultEquityIncrease,
} from '@core/services/hyperliquidService';
import { waitForBridgeCompletion } from '@core/services/intentClient';
import { logger } from '@core/utils/logger';
import type {
  DepositPlan,
  HyperliquidVaultDepositStep,
} from '@zapengine/types/api';
import { equalsAddress } from '@zapengine/types/shared';
import { useCallback, useReducer, useRef } from 'react';
import type { Address, Hash } from 'viem';

export interface ResumeReviewedDepositInput {
  /** Exact plan already reviewed and submitted by the unified invest flow. */
  plan: DepositPlan;
  /** Perp USDC snapshot captured immediately before the reviewed batch. */
  baselineUsd6: bigint;
  /** Source transaction containing the reviewed bridge call. */
  sourceTxHash: Hash;
}

const wizardLogger = logger.createContextLogger('DepositWizard');

/**
 * Resolve the connected wallet address, throwing the canonical
 * "connect wallet" error when absent. Takes the address (not the account
 * object) so callers keep `account?.address` as a stable memo dependency.
 */
function requireUserAddress(address: string | undefined): Address {
  if (!address) {
    throw new Error('Connect wallet first');
  }
  return address as Address;
}

/**
 * Follow-up half of the step 1/2/3/4 deposit wizard: real bridge polling for
 * an already-submitted reviewed batch, then the gasless HLP vaultTransfer
 * once perp USDC lands on HyperCore. This hook never submits source calls —
 * the unified Tenderly-reviewed route owns that — and all state transitions
 * run through the pure depositWizardMachine reducer.
 */
export function useDepositWizard() {
  const { account, getWalletClient } = useWalletProvider();
  const [wizard, dispatch] = useReducer(
    depositWizardReducer,
    initialDepositWizardState,
  );
  const { ref: abortRef, renew: renewAbort } = useAbortControllerRef();
  const resumeAddressRef = useRef<Address | null>(null);

  const failStage = useCallback(
    (stage: DepositWizardState['stage'], error: unknown) => {
      if (isAbortError(error)) return;
      wizardLogger.error(`[deposit-wizard] ${stage} failed:`, error);
      dispatch({
        type: 'STAGE_FAILED',
        stage,
        message: extractErrorMessage(error, 'Unexpected error'),
      });
    },
    [],
  );

  const watchHlpArrival = useCallback(
    async (params: {
      user: Address;
      step: HyperliquidVaultDepositStep;
      baselineUsd6: bigint;
      signal: AbortSignal;
    }) => {
      try {
        const { arrivedUsd6 } = await waitForPerpUsdcArrival({
          user: params.user,
          baselineUsd6: params.baselineUsd6,
          expectedUsd6: BigInt(params.step.expectedUsd),
          apiUrl: params.step.signing.apiUrl,
          signal: params.signal,
        });
        if (params.signal.aborted) return;
        dispatch({ type: 'HL_ARRIVED', arrivedUsd6 });
      } catch (error) {
        if (params.signal.aborted) return;
        failStage('hyperliquidDeposit', error);
      }
    },
    [failStage],
  );

  const watchBridgeLeg = useCallback(
    async (params: {
      plan: DepositPlan;
      legIndex: number;
      sourceTxHash: Hash;
      signal: AbortSignal;
    }): Promise<boolean> => {
      const status: WizardLegStatus = 'bridgePending';
      dispatch({
        type: 'BRIDGE_UPDATE',
        legIndex: params.legIndex,
        status,
        sourceTxHash: params.sourceTxHash,
      });

      try {
        const bridgeStatus = await waitForBridgeCompletion({
          txHash: params.sourceTxHash,
          fromChain: params.plan.sourceChainId,
          toChain: params.plan.legs[params.legIndex]!.chainId,
          signal: params.signal,
        });
        if (params.signal.aborted) return false;
        dispatch({
          type: 'BRIDGE_UPDATE',
          legIndex: params.legIndex,
          status: 'destinationConfirmed',
          ...(bridgeStatus.receiving?.txHash
            ? { destinationTxHash: bridgeStatus.receiving.txHash }
            : {}),
        });
        return true;
      } catch (error) {
        if (isAbortError(error) || params.signal.aborted) return false;
        wizardLogger.error('[deposit-wizard] bridge failed:', error);
        dispatch({
          type: 'BRIDGE_UPDATE',
          legIndex: params.legIndex,
          status: 'failed',
        });
        return false;
      }
    },
    [],
  );

  /**
   * Continue a plan whose source EVM batch was already submitted through the
   * unified Tenderly-reviewed route. This never re-executes source calls: it
   * only tracks the existing bridge, waits for HyperCore credit, and unlocks
   * the HLP vaultTransfer.
   */
  const resumeReviewedPlan = useCallback(
    async ({
      plan,
      baselineUsd6,
      sourceTxHash,
    }: ResumeReviewedDepositInput): Promise<void> => {
      // Validate before arming a new run: an unusable input must not abort the
      // previous run and freeze its half-finished progress on screen.
      const userAddress = requireUserAddress(account?.address);
      const hlpStep = hlpStepFromPlan(plan);
      if (!hlpStep) {
        throw new Error('Reviewed plan has no HLP follow-up');
      }

      const controller = renewAbort();
      // Pin the funding address: every HyperCore read and the vaultTransfer
      // itself belong to the account that paid for this bridge.
      resumeAddressRef.current = userAddress;

      dispatch({ type: 'RESET' });
      dispatch({ type: 'PLAN_LOADED', plan, baselineUsd6 });
      dispatch({ type: 'SOURCE_SUBMITTED' });
      dispatch({ type: 'SOURCE_CONFIRMED', transactionHash: sourceTxHash });

      const bridgeResults = await Promise.all(
        plan.legs.map((leg, legIndex) =>
          leg.kind === 'bridge'
            ? watchBridgeLeg({
                plan,
                legIndex,
                sourceTxHash,
                signal: controller.signal,
              })
            : Promise.resolve(true),
        ),
      );
      if (!bridgeResults.every(Boolean) || controller.signal.aborted) {
        return;
      }

      await watchHlpArrival({
        user: userAddress,
        step: hlpStep,
        baselineUsd6,
        signal: controller.signal,
      });
    },
    [account?.address, renewAbort, watchBridgeLeg, watchHlpArrival],
  );

  const runHlpDeposit = useCallback(async () => {
    const step = wizard.hlp.step;
    if (!step || wizard.hlp.status !== 'arrived') {
      throw new Error('HLP deposit is not ready yet');
    }

    const userAddress = requireUserAddress(account?.address);
    // The arrived delta was measured against the funding account's HyperCore
    // balance. Signing for a different account would move that account's
    // funds on the strength of someone else's measurement.
    if (!equalsAddress(userAddress, resumeAddressRef.current)) {
      throw new Error(
        'The connected wallet changed. Reconnect the wallet that funded this deposit.',
      );
    }

    const usd6 = resolveHlpDepositUsd6(step, wizard.hlp.arrivedUsd6);
    const signal = abortRef.current?.signal;
    const vaultAddress = step.action.vaultAddress as Address;
    // Claim the submission before the first await: a second tap must not be
    // able to open a duplicate vaultTransfer.
    dispatch({ type: 'HL_SUBMITTED' });

    let equityBeforeUsd6 = 0n;
    try {
      equityBeforeUsd6 =
        (
          await getVaultEquity({
            user: userAddress,
            vaultAddress,
            apiUrl: step.signing.apiUrl,
            ...(signal ? { signal } : {}),
          })
        )?.equityUsd6 ?? 0n;
      // Nothing is signed yet, so a run that was superseded or reset while
      // the equity read was in flight must stop before moving any funds.
      if (signal?.aborted) return;
      // Typed-data signature only — no chain switch: the phantom-agent domain
      // is fixed to chainId 1337 regardless of the wallet's current chain.
      const walletClient = await getWalletClient();
      if (signal?.aborted) return;
      // The client always resolves the wallet's CURRENT account, which can
      // change during the awaits above. Only the account whose balance delta
      // was measured may sign this transfer.
      if (
        !equalsAddress(walletClient.account.address, resumeAddressRef.current)
      ) {
        dispatch({ type: 'HL_SUBMIT_FAILED' });
        failStage(
          'hyperliquidDeposit',
          new Error(
            'The connected wallet changed. Reconnect the wallet that funded this deposit.',
          ),
        );
        return;
      }
      await submitVaultDeposit({
        walletClient,
        vaultAddress,
        usd6,
        isTestnet: step.signing.hyperliquidChain === 'Testnet',
        apiUrl: step.signing.apiUrl,
      });
    } catch (error) {
      if (isAbortError(error)) return;
      if (
        !(error instanceof HyperliquidVaultDepositError) ||
        !error.ambiguous
      ) {
        // The exchange never accepted a transfer, so the perp USDC is still
        // withdrawable: release the CTA instead of stranding the funds behind
        // a permanently disabled button.
        dispatch({ type: 'HL_SUBMIT_FAILED' });
        failStage('hyperliquidDeposit', error);
        return;
      }
      // The signed action may already have been accepted, so re-arming the
      // CTA could double a 4-day-locked position. Fall through to the equity
      // poll: it is the only evidence that separates an accepted deposit from
      // one that never landed.
      wizardLogger.error(
        '[deposit-wizard] HLP submission outcome is ambiguous:',
        error,
      );
    }

    if (signal?.aborted) return;

    try {
      const { equityUsd6 } = await waitForVaultEquityIncrease({
        user: userAddress,
        vaultAddress,
        equityBeforeUsd6,
        apiUrl: step.signing.apiUrl,
        ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) return;
      dispatch({ type: 'HL_CONFIRMED', vaultEquityUsd6: equityUsd6 });
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) return;
      // The deposit is already in flight on the exchange — a confirmation
      // timeout must never fail the stage or re-arm the deposit button.
      wizardLogger.error(
        '[deposit-wizard] HLP equity confirmation did not settle:',
        error,
      );
      dispatch({ type: 'HL_UNVERIFIED' });
    }
  }, [
    abortRef,
    account?.address,
    getWalletClient,
    failStage,
    wizard.hlp.step,
    wizard.hlp.status,
    wizard.hlp.arrivedUsd6,
  ]);

  const retry = useCallback(() => dispatch({ type: 'RETRY' }), []);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    resumeAddressRef.current = null;
    dispatch({ type: 'RESET' });
  }, [abortRef]);

  return {
    wizard,
    resumeReviewedPlan,
    runHlpDeposit,
    retry,
    reset,
  };
}
