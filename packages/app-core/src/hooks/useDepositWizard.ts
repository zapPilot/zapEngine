import { useAbortControllerRef } from '@core/hooks/useAbortControllerRef';
import {
  requireUserAddress,
  useDepositExecutionState,
} from '@core/hooks/useDepositExecutionState';
import { extractErrorMessage } from '@core/lib/errors';
import { pollUntil } from '@core/lib/polling';
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
} from '@core/services/hyperliquidService';
import { waitForBridgeCompletion } from '@core/services/intentClient';
import type { BridgeProviderId } from '@zapengine/intent-engine';
import { logger } from '@core/utils/logger';
import type {
  DepositPlan,
  HyperliquidVaultDepositStep,
} from '@zapengine/types/api';
import { useCallback, useReducer } from 'react';
import type { Address, Hash } from 'viem';

export interface StartDepositWizardInput {
  fromToken: Address;
  fromAmount: string;
}

const wizardLogger = logger.createContextLogger('DepositWizard');

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

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
    }) => {
      const status: WizardLegStatus = 'bridgePending';
      dispatch({
        type: 'BRIDGE_UPDATE',
        legIndex: params.legIndex,
        status,
        sourceTxHash: params.sourceTxHash,
      });

      try {
        const leg = params.plan.legs[params.legIndex]!;
        if (!leg.bridge) throw new Error('Bridge leg is missing its provider');
        const bridgeStatus = await waitForBridgeCompletion({
          provider: leg.bridge as BridgeProviderId,
          txHash: params.sourceTxHash,
          fromChain: params.plan.sourceChainId,
          toChain: leg.chainId,
          signal: params.signal,
        });
        dispatch({
          type: 'BRIDGE_UPDATE',
          legIndex: params.legIndex,
          status: 'destinationConfirmed',
          ...(bridgeStatus.destinationTxHash
            ? { destinationTxHash: bridgeStatus.destinationTxHash }
            : {}),
        });
      } catch (error) {
        if (isAbortError(error)) return;
        wizardLogger.error('[deposit-wizard] bridge failed:', error);
        dispatch({
          type: 'BRIDGE_UPDATE',
          legIndex: params.legIndex,
          status: 'failed',
        });
      }
    },
    [],
  );

  const start = useCallback(
    async ({ fromToken, fromAmount }: StartDepositWizardInput) =>
      actions.run(
        async () => {
          const controller = renewAbort();
          dispatch({ type: 'RESET' });

          const { userAddress, plan } = await loadBaseInvestPlan(
            { account, chain, switchChain },
            { fromToken, fromAmount },
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
                // Without the containing tx hash no provider can track the
                // transfer — surface it instead of spinning forever.
                dispatch({
                  type: 'STAGE_FAILED',
                  stage: 'bridging',
                  message:
                    'Wallet did not report the batch transaction hash, so bridge tracking could not start.',
                });
              }
            },
            onCallSubmitted: (index) => {
              dispatch({
                type: 'BRIDGE_UPDATE',
                legIndex: index,
                status: 'submitted',
              });
            },
            onCallConfirmed: (index, _tx, hash) => {
              const leg = plan.legs[index];
              if (leg?.kind !== 'bridge') return;
              void watchBridgeLeg({
                plan,
                legIndex: index,
                sourceTxHash: hash,
                signal: controller.signal,
              });
              if (
                hlpStep &&
                baselineUsd6 !== undefined &&
                leg.chainId === hlpStep.chainId
              ) {
                void watchHlpArrival({
                  user: userAddress,
                  step: hlpStep,
                  baselineUsd6,
                  signal: controller.signal,
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

  const runHlpDeposit = useCallback(async () => {
    const step = wizard.hlp.step;
    if (!step || wizard.hlp.status !== 'arrived') {
      throw new Error('HLP deposit is not ready yet');
    }

    const userAddress = requireUserAddress(account?.address);
    const usd6 = resolveHlpDepositUsd6(step, wizard.hlp.arrivedUsd6);
    const signal = abortRef.current?.signal;
    const equityBefore = (await getVaultEquity({
      user: userAddress,
      vaultAddress: step.action.vaultAddress as Address,
      apiUrl: step.signing.apiUrl,
      ...(signal ? { signal } : {}),
    })) ?? { equityUsd6: 0n };

    try {
      // Typed-data signature only — no chain switch: the phantom-agent domain
      // is fixed to chainId 1337 regardless of the wallet's current chain.
      const walletClient = await getWalletClient();
      dispatch({ type: 'HL_SUBMITTED' });
      await submitVaultDeposit({
        walletClient,
        vaultAddress: step.action.vaultAddress as Address,
        usd6,
        isTestnet: step.signing.hyperliquidChain === 'Testnet',
        apiUrl: step.signing.apiUrl,
      });

      const equity = await pollUntil({
        fn: () =>
          getVaultEquity({
            user: userAddress,
            vaultAddress: step.action.vaultAddress as Address,
            apiUrl: step.signing.apiUrl,
            ...(signal ? { signal } : {}),
          }),
        shouldStop: (value) =>
          (value?.equityUsd6 ?? 0n) > equityBefore.equityUsd6,
        intervalMs: 4_000,
        timeoutMs: 2 * 60_000,
        ...(signal ? { signal } : {}),
      });
      dispatch({
        type: 'HL_CONFIRMED',
        vaultEquityUsd6: equity?.equityUsd6 ?? 0n,
      });
    } catch (error) {
      failStage('hyperliquidDeposit', error);
      throw error;
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
    runHlpDeposit,
    retry,
    reset,
  };
}
