import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import type { DepositPlan, ReviewedDepositPlan } from '@zapengine/types/api';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { formatUnits } from 'viem';

import { ProgressTimelineRow } from '@/components/invest/ProgressTimelineRow';
import { StepHeader } from '@/components/invest/StepHeader';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import { useHyperliquidAgent } from '@/hooks/useHyperliquidAgent';
import {
  hlpProgressRows,
  hlpRetryMode,
  resumeKey,
  shouldAutoRunHlpDeposit,
  shouldOfferAgentEnable,
  unsafeResumeReason,
  type HlpProgressInput,
} from '@/integration/hlpProgressModel';
import { hlpDoneStatusLabel } from '@/integration/hyperliquidPanelModel';
import { hyperliquidAccountUrl } from '@/integration/investExecutionModel';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { formatUsd } from '@/lib/format';

function asDepositPlan(
  plan: ReviewedDepositPlan | undefined,
): DepositPlan | null {
  if (!plan || isStrategyDepositPlan(plan)) return null;
  return plan;
}

export function HlpProgressScreen() {
  const router = useRouter();
  const invest = useInvest();
  const account = useAccount();
  const {
    reviewedSubmission,
    reviewedProgress,
    reviewedQueue,
    reset: resetReviewedExecution,
  } = useInvestExecution();

  const exactPlan = asDepositPlan(reviewedQueue[0]?.plan);
  const hlpStep = exactPlan ? hlpStepFromPlan(exactPlan) : null;
  const agent = useHyperliquidAgent(hlpStep?.signing ?? null);
  const {
    wizard,
    resumeReviewedPlan,
    runHlpDeposit,
    retry,
    reset: resetHlp,
  } = useDepositWizard({ hyperliquidAgent: agent });
  const [flowError, setFlowError] = useState<string | null>(null);
  const resumedKeyRef = useRef<string | null>(null);
  const autoDepositAttemptedRef = useRef(false);

  const sourceTxHash =
    reviewedProgress?.transactionHash ??
    reviewedSubmission?.transactionHash ??
    null;
  const baselineUsd6 = invest.hlpBaselineUsd6;
  const bridgeConfirmed = wizard.legs.some(
    (leg) => leg.kind === 'bridge' && leg.status === 'destinationConfirmed',
  );

  const model = useMemo<HlpProgressInput>(
    () => ({
      hasReviewedSubmission: reviewedSubmission !== null,
      reviewedPhase: reviewedProgress?.phase ?? null,
      reviewedStatusNote: reviewedProgress?.statusNote ?? null,
      sourceTxHash,
      baselineUsd6,
      hasExactPlan: exactPlan !== null,
      hasHlpStep: hlpStep !== null,
      wizardStage: wizard.stage,
      wizardErrorStage: wizard.error?.stage ?? null,
      hlpStatus: wizard.hlp.status,
      bridgeConfirmed,
      flowError,
      agentReady: agent.isReady,
    }),
    [
      agent.isReady,
      baselineUsd6,
      bridgeConfirmed,
      exactPlan,
      flowError,
      hlpStep,
      reviewedProgress?.phase,
      reviewedProgress?.statusNote,
      reviewedSubmission,
      sourceTxHash,
      wizard.error?.stage,
      wizard.hlp.status,
      wizard.stage,
    ],
  );

  const rows = hlpProgressRows(model);
  const currentResumeKey = resumeKey(
    model,
    reviewedSubmission?.callsId ?? null,
  );
  const visibleError =
    unsafeResumeReason(model) ??
    flowError ??
    wizard.error?.message ??
    agent.error;
  const retryMode = hlpRetryMode(model);
  const awaitingSourceHash =
    model.reviewedPhase === 'confirming' && sourceTxHash === null;
  const accountUrl =
    wizard.hlp.status === 'submittedUnverified'
      ? hyperliquidAccountUrl(wizard.hlp, account.address)
      : null;

  const runGuarded = useCallback((run: () => Promise<void>) => {
    setFlowError(null);
    void run().catch((error: unknown) => {
      setFlowError(extractErrorMessage(error));
    });
  }, []);

  const trackExistingDeposit = useCallback(async () => {
    if (!exactPlan || !hlpStep || !sourceTxHash || !baselineUsd6) return;
    await resumeReviewedPlan({
      plan: exactPlan,
      baselineUsd6: BigInt(baselineUsd6),
      sourceTxHash,
    });
  }, [baselineUsd6, exactPlan, hlpStep, resumeReviewedPlan, sourceTxHash]);

  useEffect(() => {
    if (currentResumeKey === null) {
      if (resumedKeyRef.current !== null) {
        resumedKeyRef.current = null;
        autoDepositAttemptedRef.current = false;
        resetHlp();
      }
      return;
    }
    if (resumedKeyRef.current === currentResumeKey) return;
    resumedKeyRef.current = currentResumeKey;
    runGuarded(trackExistingDeposit);
  }, [currentResumeKey, resetHlp, runGuarded, trackExistingDeposit]);

  useEffect(() => {
    if (!shouldAutoRunHlpDeposit(model, autoDepositAttemptedRef.current)) {
      return;
    }
    autoDepositAttemptedRef.current = true;
    runGuarded(runHlpDeposit);
  }, [model, runGuarded, runHlpDeposit]);

  const finish = () => {
    resetHlp();
    resetReviewedExecution();
    router.replace('/home');
  };

  const retryHlpSignature = () => {
    if (wizard.hlp.status !== 'arrived' || !agent.isReady) return;
    retry();
    runGuarded(runHlpDeposit);
  };

  const retryTracking = () => {
    resumedKeyRef.current = currentResumeKey;
    autoDepositAttemptedRef.current = false;
    runGuarded(trackExistingDeposit);
  };

  const enableAgent = () => {
    autoDepositAttemptedRef.current = false;
    runGuarded(() => agent.approve());
  };

  const openHyperliquidAccount = () => {
    if (accountUrl) void Linking.openURL(accountUrl);
  };

  if (wizard.stage === 'done') {
    return (
      <ScreenScrollView>
        <StepHeader title="HLP deposit" step="Done" />
        <View className="px-5 pt-6">
          <Text className="font-serif text-[28px] leading-[32px] text-ink">
            HLP deposit complete
          </Text>
          <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
            The Base bridge was submitted once and the separate Hyperliquid
            vault action was accepted. The vault withdrawal lock starts from the
            latest deposit.
          </Text>
          {accountUrl ? (
            <Tap className="mt-4 self-start" onPress={openHyperliquidAccount}>
              <Text className="text-[12px] text-accent underline">
                View your Hyperliquid account
              </Text>
            </Tap>
          ) : null}
          <WizardDoneCard
            amountLabel={formatUsd(invest.amountUsd)}
            statusLabel={hlpDoneStatusLabel(wizard.hlp.status)}
            onDone={finish}
          />
        </View>
      </ScreenScrollView>
    );
  }

  return (
    <ScreenScrollView>
      <StepHeader title="HLP deposit" step="In progress" />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Bridge, then HLP
        </Text>
        <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
          Keep this flow open while Zap Pilot tracks the reviewed Base bridge.
          Once USDC arrives, the approved Zap Pilot agent signs the HLP deposit.
        </Text>

        <View className="mt-5 rounded-[18px] border border-line bg-[rgba(255,255,255,.02)] px-4 pt-4">
          <ProgressTimelineRow
            label="Reviewed Base batch"
            detail={
              sourceTxHash
                ? `${sourceTxHash.slice(0, 12)}… submitted`
                : 'Waiting for the wallet transaction hash.'
            }
            tone={rows.source}
          />
          <ProgressTimelineRow
            label="Bridge to Hyperliquid"
            detail="Track the existing LI.FI bridge; the source transaction is never resubmitted."
            tone={rows.bridge}
          />
          <ProgressTimelineRow
            label="HyperCore USDC arrived"
            detail={
              wizard.hlp.arrivedUsd6 !== null
                ? `${formatUnits(wizard.hlp.arrivedUsd6, 6)} USDC received for this deposit.`
                : 'Waiting for the spendable-balance delta above the pre-bridge snapshot.'
            }
            tone={rows.arrival}
          />
          <ProgressTimelineRow
            label="Deposit into official HLP vault"
            detail={
              wizard.hlp.status === 'confirming'
                ? 'Hyperliquid vaultTransfer submitted; verifying vault equity.'
                : 'Signed by your approved Zap Pilot agent once the bridge arrives.'
            }
            tone={rows.vault}
            isLast
          />
        </View>

        {awaitingSourceHash ? (
          <Text className="mt-4 text-center text-[11px] leading-4 text-ink-dim">
            Waiting for your wallet to report the batch transaction hash.
            Nothing is resubmitted while the batch confirms.
          </Text>
        ) : null}

        {visibleError ? (
          <View className="mt-5">
            <InlineErrorCard
              title="HLP deposit needs attention"
              body={visibleError}
              action={
                retryMode === 'hlp-signature' && agent.isReady
                  ? { label: 'Retry HLP deposit', onPress: retryHlpSignature }
                  : retryMode === 'tracking'
                    ? { label: 'Retry tracking', onPress: retryTracking }
                    : {
                        label: 'Return home',
                        onPress: () => router.replace('/home'),
                      }
              }
            />
          </View>
        ) : null}

        {shouldOfferAgentEnable(model) ? (
          <PrimaryButton
            className="mt-5"
            disabled={
              agent.status === 'checking' || agent.status === 'approving'
            }
            onPress={enableAgent}
          >
            {agent.status === 'approving'
              ? 'Confirm in your wallet…'
              : 'Enable Hyperliquid signing and deposit'}
          </PrimaryButton>
        ) : null}

        {wizard.hlp.status === 'arrived' && agent.isReady && !wizard.error ? (
          <Text className="mt-4 text-center text-[11px] leading-4 text-ink-dim">
            Funds arrived. Depositing into HLP…
          </Text>
        ) : null}

        {wizard.hlp.status === 'confirming' ? (
          <PrimaryButton className="mt-5" disabled onPress={() => undefined}>
            Verifying HLP position…
          </PrimaryButton>
        ) : null}
      </View>
    </ScreenScrollView>
  );
}
