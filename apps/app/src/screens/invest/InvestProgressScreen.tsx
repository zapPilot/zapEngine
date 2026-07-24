import { Redirect, useRouter } from 'expo-router';
import { Check, Circle, LoaderCircle, X } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { StepHeader } from '@/components/invest/StepHeader';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { StrategyWizardStep } from '@zapengine/app-core/lib/wallet/strategyDepositMachine';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { formatUsd } from '@/lib/format';

function StepIcon({ step }: { step: StrategyWizardStep }) {
  if (step.status === 'confirmed') {
    return <Check size={14} color="#0a0a0a" strokeWidth={2.5} />;
  }
  if (step.status === 'submitting' || step.status === 'confirming') {
    return <LoaderCircle size={14} color="#d4c5a3" />;
  }
  if (step.status === 'failed') {
    return <X size={14} color="#ef7474" strokeWidth={2.5} />;
  }
  return (
    <Circle
      size={8}
      color={step.status === 'ready' ? '#d4c5a3' : '#52525b'}
      fill={step.status === 'ready' ? '#d4c5a3' : 'transparent'}
    />
  );
}

function StepRow({
  step,
  isLast,
}: {
  step: StrategyWizardStep;
  isLast: boolean;
}) {
  const confirmed = step.status === 'confirmed';
  const active = step.status !== 'locked';
  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View
          className="h-8 w-8 items-center justify-center rounded-full border"
          style={{
            borderColor: confirmed
              ? '#d4c5a3'
              : active
                ? 'rgba(212,197,163,.45)'
                : 'rgba(255,255,255,.08)',
            backgroundColor: confirmed
              ? '#d4c5a3'
              : active
                ? 'rgba(212,197,163,.09)'
                : 'rgba(255,255,255,.02)',
          }}
        >
          <StepIcon step={step} />
        </View>
        {!isLast ? (
          <View
            className="min-h-7 flex-1 w-px"
            style={{
              backgroundColor: confirmed
                ? 'rgba(212,197,163,.45)'
                : 'rgba(255,255,255,.07)',
            }}
          />
        ) : null}
      </View>
      <View className="flex-1 pb-5 pt-1">
        <Text
          className="font-sans-semibold text-[13.5px]"
          style={{ color: active ? '#f4f4f5' : '#71717a' }}
        >
          {step.label}
        </Text>
        <Text className="mt-1 text-[11px] leading-[16px] text-ink-dim">
          {step.detail}
        </Text>
        {step.transactionHash ? (
          <Text className="mt-1 font-mono text-[9px] text-accent">
            {step.transactionHash.slice(0, 10)}… submitted
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ctaLabel(step: StrategyWizardStep | undefined, pending: boolean) {
  if (pending) {
    return step?.status === 'confirming'
      ? 'Waiting for confirmation…'
      : 'Working…';
  }
  if (!step) return 'Continue';
  if (step.kind === 'switch-chain') return step.label;
  if (step.kind === 'mock-bridge') return 'Confirm mock checkpoint';
  if (step.status === 'confirming') return 'Retry confirmation check';
  return step.label;
}

export function InvestProgressScreen() {
  const router = useRouter();
  const { amountUsd } = useInvest();
  const { wizard, pending, startFromDraft, advance, retry, reset } =
    useInvestExecution();

  if (wizard.status === 'idle' && !pending && !wizard.error) {
    return <Redirect href="/invest/amount" />;
  }

  const currentStep = wizard.steps[wizard.currentIndex];
  const isDone = wizard.status === 'done';
  const planFailed = wizard.steps.length === 0 && Boolean(wizard.error);

  return (
    <ScreenScrollView>
      <StepHeader
        title={isDone ? 'Complete' : 'Guided execution'}
        step={
          isDone
            ? 'Done'
            : `${wizard.currentIndex + 1} / ${wizard.steps.length}`
        }
      />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          {isDone ? 'Investment complete' : 'One action at a time'}
        </Text>
        <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
          Each successful wallet action unlocks the next. Confirmed transactions
          are never submitted again on retry.
        </Text>

        {wizard.error ? (
          <View className="mt-5">
            <InlineErrorCard
              body={wizard.error}
              action={{ label: 'Dismiss', onPress: retry }}
            />
          </View>
        ) : null}

        {wizard.steps.length === 0 && !wizard.error ? (
          <View className="mt-5 gap-3">
            <SkeletonBlock className="h-[52px] rounded-2xl" />
            <SkeletonBlock className="h-[52px] rounded-2xl" />
          </View>
        ) : null}

        {wizard.steps.length > 0 ? (
          <View className="mt-5 rounded-[18px] border border-line bg-[rgba(255,255,255,.02)] px-4 pt-4">
            {wizard.steps.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                isLast={index === wizard.steps.length - 1}
              />
            ))}
          </View>
        ) : null}

        {currentStep?.kind === 'mock-bridge' && !isDone ? (
          <View className="mt-4 rounded-xl border border-[rgba(234,179,8,.2)] bg-[rgba(234,179,8,.06)] p-3">
            <Text className="font-sans-semibold text-[12px] text-[#d7bd70]">
              This is a UI checkpoint only
            </Text>
            <Text className="mt-1 text-[11px] leading-[17px] text-[#aa9760]">
              No bridge API is called and no transaction hash is created.
              Arbitrum balance preflight happens at the next step.
            </Text>
          </View>
        ) : null}

        {!isDone ? (
          <PrimaryButton
            className="mt-5"
            disabled={pending || (!currentStep && !planFailed)}
            onPress={() => {
              if (planFailed) {
                retry();
                void startFromDraft();
                return;
              }
              if (wizard.error) retry();
              void advance();
            }}
          >
            {planFailed ? 'Retry plan' : ctaLabel(currentStep, pending)}
          </PrimaryButton>
        ) : null}

        {isDone ? (
          <WizardDoneCard
            amountLabel={formatUsd(amountUsd)}
            statusLabel="Morpho supplied · GMX settled"
            onDone={() => {
              reset();
              router.replace('/home');
            }}
          />
        ) : null}
      </View>
    </ScreenScrollView>
  );
}
