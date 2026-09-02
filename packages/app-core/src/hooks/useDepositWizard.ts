import { useAbortControllerRef } from '@core/hooks/useAbortControllerRef';
import {
  requireUserAddress,
  useDepositExecutionState,
} from '@core/hooks/useDepositExecutionState';
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
import { executeDepositPlanWithWallet } from '@core/lib/wallet/executeDepositPlan';
import { loadBaseInvestPlan } from '@core/lib/wallet/loadBaseInvestPlan';
import { useWalletProvider } from '@core/providers/walletContext';
import {
  getPerpUsdcBalance,
  getVaultEquity,
  submitVaultDeposit,
  waitForPerpUsdcArrival,
  waitForVaultEquityIncrease,
} from '@core/services/hyperliquidService';
import { waitForBridgeCompletion } from '@core/services/intentClient';
import { logger } from '@core/utils/logger';
import type {
  ChainSplit,
  DepositPlan,
  HyperliquidVaultDepositStep,
} from '@zapengine/types/api';
import { useCallback, useReducer } from 'react';
import type { Address, Hash } from 'viem';

export interface StartDepositWizardInput {
  fromToken: Address;
  fromAmount: string;
  /**
   * Destination weights per chainId. Omitted, the backend falls back to its
   * `DEPOSIT_DEFAULT_SPLIT` rollout config; the HLP entry point pins
   * HyperCore explicitly so it never depends on that env.
   */
  split?: ChainSplit;
}

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
 * Drives the step 1/2/3/4 deposit wizard: one EIP-7702 batch on Base
 * (approvals + supplies + bridge sends), real bridge polling, then the
 * gasless HLP vaultTransfer once perp USDC lands on HyperCore. All state
 * transitions run through the pure depositWizardMachine reducer.
 */
export function useDepositWizard() {
  const {
    account,
    chain,
    executeAtomicBatch,
    externalWalletBrand,
    getWalletClient,
    switchChain,
  } = useWalletProvider();
  const { state, actions } = useDepositExecutionState();
  const [wizard, dispatch] = useReducer(
    depositWizardReducer,
    initialDepositWizardState,
  );
  const { ref: abortRef, renew: renewAbort } = useAbortControllerRef();

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
        dispatch({ type: 'HL_ARRIVED', arrivedUsd6 });
      } catch (error) {
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
        if (isAbortError(error)) return false;
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

  const start = useCallback(
    async ({ fromToken, fromAmount, split }: StartDepositWizardInput) =>
      actions.run(
        async () => {
          const controller = renewAbort();
          dispatch({ type: 'RESET' });

          const { userAddress, plan } = await loadBaseInvestPlan(
            { account, chain, switchChain },
            { fromToken, fromAmount, ...(split ? { split } : {}) },
          );
          actions.setLastPlan(plan);

          // Snapshot the perp balance BEFORE the batch so pre-existing USDC
          // on HyperCore can't register as a false arrival.
          const hlpStep = hlpStepFromPlan(plan);
          const baselineUsd6 = hlpStep
            ? (
                await getPerpUsdcBalance({
                  user: userAddress,
                  apiUrl: hlpStep.signing.apiUrl,
                })
              ).withdrawableUsd6
            : undefined;

          dispatch({
            type: 'PLAN_LOADED',
            plan,
            ...(baselineUsd6 !== undefined ? { baselineUsd6 } : {}),
          });

          const startBridgeWatchers = (sourceTxHash: Hash) => {
            for (const [legIndex, leg] of plan.legs.entries()) {
              if (leg.kind !== 'bridge') continue;
              void watchBridgeLeg({
                plan,
                legIndex,
                sourceTxHash,
                signal: controller.signal,
              });
            }
            if (hlpStep && baselineUsd6 !== undefined) {
              void watchHlpArrival({
                user: userAddress,
                step: hlpStep,
                baselineUsd6,
                signal: controller.signal,
              });
            }
          };

          const execution = await executeDepositPlanWithWallet({
            plan,
            chainId: plan.sourceChainId,
            getWalletClient,
            ...(externalWalletBrand ? { externalWalletBrand } : {}),
            ...(executeAtomicBatch ? { executeAtomicBatch } : {}),
            onBundleSubmitted: (callsId) => {
              actions.markBundleSubmitted(callsId);
              dispatch({ type: 'SOURCE_SUBMITTED' });
            },
            onBundleConfirmed: (transactionHash) => {
              actions.markBundleConfirmed(transactionHash);
              dispatch({
                type: 'SOURCE_CONFIRMED',
                ...(transactionHash ? { transactionHash } : {}),
              });
              if (transactionHash) {
                startBridgeWatchers(transactionHash);
              } else if (plan.legs.some((leg) => leg.kind === 'bridge')) {
                // Without the containing tx hash LI.FI cannot track the
                // transfer — surface it instead of spinning forever.
                dispatch({
                  type: 'STAGE_FAILED',
                  stage: 'bridging',
                  message:
                    'Wallet did not report the batch transaction hash; track the bridge on scan.li.fi manually.',
                });
              }
            },
          });

          return actions.applyExecutionResult(execution);
        },
        (error) =>
          failStage(
            wizard.stage === 'configure' ? 'sourceExecution' : wizard.stage,
            error,
          ),
      ),
    [
      account,
      chain,
      executeAtomicBatch,
      externalWalletBrand,
      getWalletClient,
      switchChain,
      actions,
      failStage,
      renewAbort,
      watchBridgeLeg,
      watchHlpArrival,
      wizard.stage,
    ],
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
      const controller = renewAbort();
      const userAddress = requireUserAddress(account?.address);
      const hlpStep = hlpStepFromPlan(plan);
      if (!hlpStep) {
        throw new Error('Reviewed plan has no HLP follow-up');
      }

      dispatch({ type: 'RESET' });
      actions.setLastPlan(plan);
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
    [
      account?.address,
      actions,
      renewAbort,
      watchBridgeLeg,
      watchHlpArrival,
    ],
  );

  const runHlpDeposit = useCallback(async () => {
    const step = wizard.hlp.step;
    if (!step || wizard.hlp.status !== 'arrived') {
      throw new Error('HLP deposit is not ready yet');
    }

    const userAddress = requireUserAddress(account?.address);
    const usd6 = resolveHlpDepositUsd6(step, wizard.hlp.arrivedUsd6);
    const signal = abortRef.current?.signal;
    const vaultAddress = step.action.vaultAddress as Address;
    // Claim the submission before the first await: a second tap must not be
    // able to open a duplicate vaultTransfer.
    dispatch({ type: 'HL_SUBMITTED' });

    let equityBeforeUsd6: bigint;
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
      // Typed-data signature only — no chain switch: the phantom-agent domain
      // is fixed to chainId 1337 regardless of the wallet's current chain.
      const walletClient = await getWalletClient();
      await submitVaultDeposit({
        walletClient,
        vaultAddress,
        usd6,
        isTestnet: step.signing.hyperliquidChain === 'Testnet',
        apiUrl: step.signing.apiUrl,
      });
    } catch (error) {
      if (isAbortError(error)) return;
      // The exchange never accepted a transfer, so the perp USDC is still
      // withdrawable: release the CTA instead of stranding the funds behind a
      // permanently disabled button.
      dispatch({ type: 'HL_SUBMIT_FAILED' });
      failStage('hyperliquidDeposit', error);
      return;
    }

    try {
      const { equityUsd6 } = await waitForVaultEquityIncrease({
        user: userAddress,
        vaultAddress,
        equityBeforeUsd6,
        apiUrl: step.signing.apiUrl,
        ...(signal ? { signal } : {}),
      });
      dispatch({ type: 'HL_CONFIRMED', vaultEquityUsd6: equityUsd6 });
    } catch (error) {
      if (isAbortError(error)) return;
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
    dispatch({ type: 'RESET' });
  }, [abortRef]);

  return {
    ...state,
    wizard,
    start,
    resumeReviewedPlan,
    runHlpDeposit,
    retry,
    reset,
  };
}
