import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import type {
  DepositPlan,
  PlanOrchestrationDepositPlan,
} from '@zapengine/types/api';
import { useRouter } from 'expo-router';
import { Check, Circle, LoaderCircle, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Hash } from 'viem';

import { StepHeader } from '@/components/invest/StepHeader';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { hlpDoneStatusLabel } from '@/integration/hyperliquidPanelModel';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';
import { formatUsd } from '@/lib/format';

type RowState = 'waiting' | 'active' | 'done' | 'failed';

function asDepositPlan(
  plan: PlanOrchestrationDepositPlan | undefined,
): DepositPlan | null {
  if (!plan || isStrategyDepositPlan(plan)) return null;
  return plan;
}

function ProgressIcon({ state }: { state: RowState }) {
  if (state === 'done') {
    return <Check size={14} color="#0a0a0a" strokeWidth={2.5} />;
  }
  if (state === 'active') {
    return <LoaderCircle size={14} color="#d4c5a3" />;
  }
  if (state === 'failed') {
    return <X size={14} color="#ef7474" strokeWidth={2.5} />;
  }
  return <Circle size={8} color="#52525b" />;
}

function ProgressRow({
  label,
  detail,
  state,
  isLast = false,
}: {
  label: string;
  detail: string;
  state: RowState;
  isLast?: boolean;
}) {
  const done = state === 'done';
  const active = state === 'active';
  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View
          className="h-8 w-8 items-center justify-center rounded-full border"
          style={{
            borderColor: done
              ? '#d4c5a3'
              : active
                ? 'rgba(212,197,163,.45)'
                : state === 'failed'
                  ? 'rgba(239,116,116,.45)'
                  : 'rgba(255,255,255,.08)',
            backgroundColor: done
              ? '#d4c5a3'
              : active
                ? 'rgba(212,197,163,.09)'
                : 'rgba(255,255,255,.02)',
          }}
        >
          <ProgressIcon state={state} />
        </View>
        {!isLast ? (
          <View
            className="min-h-7 flex-1 w-px"
            style={{
              backgroundColor: done
                ? 'rgba(212,197,163,.45)'
                : 'rgba(255,255,255,.07)',
            }}
          />
        ) : null}
      </View>
      <View className="flex-1 pb-5 pt-1">
        <Text
          className="font-sans-semibold text-[13.5px]"
          style={{ color: state === 'waiting' ? '#71717a' : '#f4f4f5' }}
        >
          {label}
        </Text>
        <Text className="mt-1 text-[11px] leading-[16px] text-ink-dim">
          {detail}
        </Text>
      </View>
    </View>
  );
}

export function HlpProgressScreen() {
  const router = useRouter();
  const invest = useInvest();
  const {
    reviewedSubmission,
    reviewedProgress,
    reviewedQueue,
    reset: resetReviewedExecution,
  } = useInvestExecution();
  const {
    wizard,
    resumeReviewedPlan,
    runHlpDeposit,
    retry,
    reset: resetHlp,
  } = useDepositWizard();
  const [flowError, setFlowError] = useState<string | null>(null);
  const resumedKeyRef = useRef<string | null>(null);
  const autoDepositAttemptedRef = useRef(false);

  const exactPlan = asDepositPlan(reviewedQueue[0]?.plan);
  const hlpStep = exactPlan ? hlpStepFromPlan(exactPlan) : null;
  const sourceTxHash =
    reviewedProgress?.transactionHash ?? reviewedSubmission?.transactionHash;
  const baselineUsd6 = invest.hlpBaselineUsd6;
  const reviewedFailed = reviewedProgress?.phase === 'failed';
  const isDone = wizard.stage === 'done';

  useEffect(() => {
    if (
      !exactPlan ||
      !hlpStep ||
      !sourceTxHash ||
      !baselineUsd6 ||
      reviewedFailed
    ) {
      return;
    }
    const key = `${reviewedSubmission?.callsId ?? 'reviewed'}:${sourceTxHash}:${baselineUsd6}`;
    if (resumedKeyRef.current === key) return;
    resumedKeyRef.current = key;
    setFlowError(null);
    void resumeReviewedPlan({
      plan: exactPlan,
      baselineUsd6: BigInt(baselineUsd6),
      sourceTxHash: sourceTxHash as Hash,
    }).catch((error: unknown) => {
      setFlowError(error instanceof Error ? error.message : String(error));
    });
  }, [
    baselineUsd6,
    exactPlan,
    hlpStep,
    resumeReviewedPlan,
    reviewedFailed,
    reviewedSubmission?.callsId,
    sourceTxHash,
  ]);

  useEffect(() => {
    if (
      wizard.hlp.status !== 'arrived' ||
      wizard.error ||
      autoDepositAttemptedRef.current
    ) {
      return;
    }
    // This keeps the product interaction to one app CTA. Hyperliquid still
    // opens its own wallet typed-data confirmation; there is no auto-signing.
    autoDepositAttemptedRef.current = true;
    void runHlpDeposit().catch((error: unknown) => {
      setFlowError(error instanceof Error ? error.message : String(error));
    });
  }, [runHlpDeposit, wizard.error, wizard.hlp.status]);

  const sourceState: RowState = reviewedFailed
    ? 'failed'
    : sourceTxHash
      ? 'done'
      : 'active';
  const bridgeState: RowState =
    wizard.legs.some(
      (leg) => leg.kind === 'bridge' && leg.status === 'destinationConfirmed',
    )
      ? 'done'
      : wizard.error?.stage === 'bridging'
        ? 'failed'
        : wizard.stage === 'bridging'
          ? 'active'
          : 'waiting';
  const arrivalState: RowState =
    wizard.hlp.status === 'arrived' ||
    wizard.hlp.status === 'confirming' ||
    wizard.hlp.status === 'submittedUnverified' ||
    wizard.hlp.status === 'deposited'
      ? 'done'
      : wizard.error?.stage === 'hyperliquidDeposit'
        ? 'failed'
        : wizard.hlp.status === 'awaitingArrival'
          ? 'active'
          : 'waiting';
  const vaultState: RowState =
    wizard.hlp.status === 'deposited' ||
    wizard.hlp.status === 'submittedUnverified'
      ? 'done'
      : wizard.hlp.status === 'confirming'
        ? 'active'
        : wizard.error?.stage === 'hyperliquidDeposit'
          ? 'failed'
          : 'waiting';

  const unsafeResumeReason = !reviewedSubmission
    ? 'The reviewed source batch is missing. Return to the route and submit a fresh review.'
    : !baselineUsd6
      ? 'The pre-bridge Hyperliquid balance snapshot is missing. For safety, Zap Pilot will not infer the deposit amount from the current balance.'
      : !exactPlan || !hlpStep
        ? 'The submitted reviewed plan does not contain the expected HLP follow-up.'
        : reviewedFailed
          ? (reviewedProgress?.statusNote ?? 'The reviewed Base batch failed.')
          : null;
  const visibleError = unsafeResumeReason ?? flowError ?? wizard.error?.message;
  const canRetryHlp =
    wizard.error?.stage === 'hyperliquidDeposit' &&
    wizard.hlp.status === 'arrived';

  const finish = () => {
    resetHlp();
    resetReviewedExecution();
    router.replace('/home');
  };

  if (isDone) {
    return (
      <ScreenScrollView>
        <StepHeader title="HLP deposit" step="Done" />
        <View className="px-5 pt-6">
          <Text className="font-serif text-[28px] leading-[32px] text-ink">
            HLP deposit complete
          </Text>
          <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
            The Base bridge was submitted once and the separate Hyperliquid
            vault action was accepted. The vault withdrawal lock starts from
            the latest deposit.
          </Text>
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
          When the USDC arrives, your wallet will ask for the separate HLP
          typed-data signature.
        </Text>

        <View className="mt-5 rounded-[18px] border border-line bg-[rgba(255,255,255,.02)] px-4 pt-4">
          <ProgressRow
            label="Reviewed Base batch"
            detail={
              sourceTxHash
                ? `${String(sourceTxHash).slice(0, 12)}… submitted`
                : 'Waiting for the wallet transaction hash.'
            }
            state={sourceState}
          />
          <ProgressRow
            label="Bridge to Hyperliquid"
            detail="Track the existing LI.FI bridge; the source transaction is never resubmitted."
            state={bridgeState}
          />
          <ProgressRow
            label="HyperCore USDC arrived"
            detail={
              wizard.hlp.arrivedUsd6 !== null
                ? `${Number(wizard.hlp.arrivedUsd6) / 1_000_000} USDC received for this deposit.`
                : 'Waiting for the balance delta above the pre-bridge snapshot.'
            }
            state={arrivalState}
          />
          <ProgressRow
            label="Deposit into official HLP vault"
            detail={
              wizard.hlp.status === 'confirming'
                ? 'Hyperliquid vaultTransfer submitted; verifying vault equity.'
                : 'A separate wallet signature is required only after the bridge arrives.'
            }
            state={vaultState}
            isLast
          />
        </View>

        {visibleError ? (
          <View className="mt-5">
            <InlineErrorCard
              title="HLP deposit needs attention"
              body={visibleError}
              action={
                canRetryHlp
                  ? {
                      label: 'Retry HLP signature',
                      onPress: () => {
                        setFlowError(null);
                        retry();
                        void runHlpDeposit().catch((error: unknown) => {
                          setFlowError(
                            error instanceof Error ? error.message : String(error),
                          );
                        });
                      },
                    }
                  : {
                      label: 'Create fresh review',
                      onPress: () => {
                        resetHlp();
                        resetReviewedExecution();
                        router.replace('/invest/route');
                      },
                    }
              }
            />
          </View>
        ) : null}

        {wizard.hlp.status === 'arrived' && !wizard.error ? (
          <Text className="mt-4 text-center text-[11px] leading-4 text-ink-dim">
            Funds arrived. Opening the HLP wallet confirmation…
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
