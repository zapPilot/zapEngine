import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import {
  CONNECT_WALLET_CTA,
  CONNECTING_LABEL,
} from '@/components/connect/connectCopy';
import * as StrategyFlow from '@/components/invest/StrategyFlow';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { useAccount } from '@/integration/useAccount';
import {
  useInvest,
  useInvestDepositPlanPreview,
} from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';

const CAPABILITY_NOTICE = {
  'connect-wallet': {
    title: 'Connect your wallet',
    body: 'Connect the wallet that holds both Base and Arbitrum funding balances.',
  },
  'unsupported-wallet': {
    title: 'Wallet execution unavailable',
    body: 'This wallet cannot submit the guided transactions.',
  },
  'unsupported-path': {
    title: 'Strategy route unavailable',
    body: 'Return to the amount step and choose supported funding tokens.',
  },
} as const;

export function InvestConfirmScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const preview = useInvestDepositPlanPreview();
  const { capability, pending, startFromDraft } = useInvestExecution();

  const ready = capability === 'ready';
  const canConnect = capability === 'connect-wallet';
  const ctaLabel = canConnect
    ? account.isConnecting
      ? CONNECTING_LABEL
      : CONNECT_WALLET_CTA
    : pending
      ? 'Refreshing plan…'
      : 'Start guided execution';

  return (
    <ScreenScrollView>
      <StrategyFlow.StepHeader title="Confirm" step="Step 3 of 3" />
      <StrategyFlow.StepProgress current={3} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Confirm investment
        </Text>
        <StrategyFlow.StrategyPlanSummary
          variant="confirm"
          plan={preview.plan}
          amountUsd={preview.amountUsd}
          baseToken={invest.baseFundingToken}
          arbitrumToken={invest.arbitrumFundingToken}
        />

        <StrategyFlow.MockBridgeNotice
          title="Mock bridge does not transfer assets"
          body="You will approve and submit each action manually. Before the Arbitrum group starts, the app checks this wallet's real balance again."
        />

        {!ready ? (
          <View className="mt-4">
            <NonCustodialCard
              title={CAPABILITY_NOTICE[capability].title}
              body={CAPABILITY_NOTICE[capability].body}
            />
          </View>
        ) : null}
        <PrimaryButton
          className="mt-5"
          disabled={
            account.isConnecting ||
            pending ||
            preview.amountUsd <= 0 ||
            !preview.plan ||
            (!ready && !canConnect)
          }
          onPress={() => {
            if (canConnect) {
              void account.connect();
              return;
            }
            if (!ready) return;
            // The wizard reducer already captures start failures as
            // wizard.error; the catch only silences the duplicate rejection.
            void startFromDraft()
              .catch(() => undefined)
              .finally(() => router.push('/invest/progress'));
          }}
        >
          {ctaLabel}
        </PrimaryButton>
        <Text className="mt-3 text-center text-[10.5px] leading-[16px] text-ink-faint">
          No custody and no automatic signatures. Confirm one wallet action at a
          time.
        </Text>
      </View>
    </ScreenScrollView>
  );
}
