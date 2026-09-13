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
  getHyperCoreSpendableUsdc,
  getVaultEquity,
  HyperliquidVaultDepositError,
  submitVaultDeposit,
  waitForHyperCoreUsdcArrival,
  waitForVaultEquityIncrease,
} from '@core/services/hyperliquidService';
import { waitForBridgeCompletion } from '@core/services/intentClient';
import { logger } from '@core/utils/logger';
import {
  type DepositPlan,
  type HlpSpotDepositPlan,
  HYPERLIQUID_BRIDGE2_BRIDGE_ID,
  type HyperliquidVaultDepositStep,
} from '@zapengine/types/api';
import { equalsAddress } from '@zapengine/types/shared';
import { useCallback, useReducer, useRef } from 'react';
import type { Address, Hash, LocalAccount } from 'viem';

export interface ResumeReviewedDepositInput {
  /** Exact plan already reviewed and submitted by the unified invest flow. */
  plan: DepositPlan;
  /** Spendable HyperCore USDC snapshot captured before the reviewed batch. */
  baselineUsd6: bigint;
  /** Source transaction containing the reviewed bridge call. */
  sourceTxHash: Hash;
}

export interface HyperliquidAgentSigningPort {
  isReady: boolean;
  masterAddress: Address | null;
  getSigner(expectedMaster: Address): Promise<LocalAccount>;
}

const wizardLogger = logger.createContextLogger('DepositWizard');

function requireUserAddress(address: string | undefined): Address {
  if (!address) throw new Error('Connect wallet first');
  return address as Address;
}

/**
 * Follow-up half of the deposit wizard: bridge polling for an already-reviewed
 * source batch, plus direct spot-funded HLP deposits. Every vaultTransfer is
 * signed by the approved device-local Hyperliquid agent.
 */
export function useDepositWizard({
  hyperliquidAgent,
}: {
  hyperliquidAgent: HyperliquidAgentSigningPort;
}) {
  const { account } = useWalletProvider();
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
      const expectedUsd = params.step.expectedUsd;
      if (expectedUsd === undefined) {
        throw new Error(
          'Bridge-funded HLP step is missing its expected amount',
        );
      }
      try {
        const { arrivedUsd6 } = await waitForHyperCoreUsdcArrival({
          user: params.user,
          baselineUsd6: params.baselineUsd6,
          expectedUsd6: BigInt(expectedUsd),
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
      const leg = params.plan.legs[params.legIndex];
      if (!leg) return false;
      dispatch({
        type: 'BRIDGE_UPDATE',
        legIndex: params.legIndex,
        status: 'bridgePending' as WizardLegStatus,
        sourceTxHash: params.sourceTxHash,
      });

      // Bridge2 is a direct Arbitrum USDC transfer, not a LI.FI route, so
      // there is no route status to poll. The reviewed wallet batch already
      // confirmed the source transaction; arrival is proven by the HyperCore
      // balance delta `watchHlpArrival` waits on. LI.FI routes into HyperCore
      // also carry `protocol: 'hyperliquid'`, so key off the bridge id.
      if (leg.bridge === HYPERLIQUID_BRIDGE2_BRIDGE_ID) {
        if (params.signal.aborted) return false;
        dispatch({
          type: 'BRIDGE_UPDATE',
          legIndex: params.legIndex,
          status: 'destinationConfirmed',
        });
        return true;
      }

      try {
        const bridgeStatus = await waitForBridgeCompletion({
          txHash: params.sourceTxHash,
          fromChain: params.plan.sourceChainId,
          toChain: leg.chainId,
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

  const resumeReviewedPlan = useCallback(
    async ({
      plan,
      baselineUsd6,
      sourceTxHash,
    }: ResumeReviewedDepositInput): Promise<void> => {
      const userAddress = requireUserAddress(account?.address);
      const hlpStep = hlpStepFromPlan(plan);
      if (!hlpStep) throw new Error('Reviewed plan has no HLP follow-up');

      const controller = renewAbort();
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
      if (!bridgeResults.every(Boolean) || controller.signal.aborted) return;

      await watchHlpArrival({
        user: userAddress,
        step: hlpStep,
        baselineUsd6,
        signal: controller.signal,
      });
    },
    [account?.address, renewAbort, watchBridgeLeg, watchHlpArrival],
  );

  /** Arm a direct HLP deposit against the live account-mode-aware balance. */
  const startSpotDeposit = useCallback(
    async (plan: HlpSpotDepositPlan): Promise<void> => {
      const userAddress = requireUserAddress(account?.address);
      const controller = renewAbort();
      resumeAddressRef.current = userAddress;

      const balance = await getHyperCoreSpendableUsdc({
        user: userAddress,
        apiUrl: plan.step.signing.apiUrl,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      dispatch({
        type: 'SPOT_PLAN_LOADED',
        plan,
        spendableUsd6: balance.spendableUsd6,
      });
    },
    [account?.address, renewAbort],
  );

  const runHlpDeposit = useCallback(async () => {
    const step = wizard.hlp.step;
    if (!step || wizard.hlp.status !== 'arrived') {
      throw new Error('HLP deposit is not ready yet');
    }

    const userAddress = requireUserAddress(account?.address);
    const resumeAddress = resumeAddressRef.current;
    if (!resumeAddress || !equalsAddress(userAddress, resumeAddress)) {
      throw new Error(
        'The connected wallet changed. Reconnect the wallet that funded this deposit.',
      );
    }
    if (
      !hyperliquidAgent.isReady ||
      !hyperliquidAgent.masterAddress ||
      !equalsAddress(hyperliquidAgent.masterAddress, userAddress)
    ) {
      throw new Error('Enable Hyperliquid signing for this wallet first');
    }

    const usd6 = resolveHlpDepositUsd6(step, wizard.hlp.arrivedUsd6);
    const signal = abortRef.current?.signal;
    const vaultAddress = step.action.vaultAddress as Address;
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
      if (signal?.aborted) return;

      const signer = await hyperliquidAgent.getSigner(resumeAddress);
      if (signal?.aborted) return;
      await submitVaultDeposit({
        signer,
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
        dispatch({ type: 'HL_SUBMIT_FAILED' });
        failStage('hyperliquidDeposit', error);
        return;
      }
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
      wizardLogger.error(
        '[deposit-wizard] HLP equity confirmation did not settle:',
        error,
      );
      dispatch({ type: 'HL_UNVERIFIED' });
    }
  }, [
    abortRef,
    account?.address,
    failStage,
    hyperliquidAgent,
    wizard.hlp.arrivedUsd6,
    wizard.hlp.status,
    wizard.hlp.step,
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
    startSpotDeposit,
    retry,
    reset,
  };
}
