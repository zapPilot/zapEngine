import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import {
  CONNECT_WALLET_CTA,
  CONNECTING_LABEL,
} from '@/components/connect/connectCopy';
import { StepHeader } from '@/components/invest/StepHeader';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { MockBridgeNotice } from '@/components/invest/MockBridgeNotice';
import {
  isDepositPlanForScope,
  StrategyPlanSummary,
} from '@/components/invest/StrategyPlanSummary';
import { StepProgress } from '@/components/invest/StepProgress';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { useAccount } from '@/integration/useAccount';
import type { DepositExecutionCapability } from '@/integration/investExecutionModel';
import {
  type InvestScope,
  useInvest,
  useInvestDepositPlanPreview,
} from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';

const CAPABILITY_NOTICE = {
  'unsupported-wallet': {
    title: 'Wallet execution unavailable',
    body: 'This wallet cannot submit the guided transactions.',
  },
  'unsupported-path': {
    title: 'Strategy route unavailable',
    body: 'Return to the amount step and choose supported funding tokens.',
  },
} as const;

function connectWalletBody(
  scope: InvestScope,
  baseTokenSymbol: string,
): string {
  if (scope === 'base') {
    return `Connect the wallet that holds Base ${baseTokenSymbol}.`;
  }
  if (scope === 'arbitrum') {
    return 'Connect the wallet that holds Arbitrum USDC.';
  }
  return 'Connect the wallet that holds both Base and Arbitrum funding balances.';
}

function capabilityNotice(
  capability: DepositExecutionCapability,
  scope: InvestScope,
  baseTokenSymbol: string,
): { title: string; body: string } | null {
  if (capability === 'connect-wallet') {
    return {
      title: 'Connect your wallet',
      body: connectWalletBody(scope, baseTokenSymbol),
    };
  }
  if (capability === 'unsupported-wallet') {
    return {
      ...CAPABILITY_NOTICE[capability],
      body:
        scope === 'both'
          ? CAPABILITY_NOTICE[capability].body
          : 'Use Privy or an Ambire EIP-7702 wallet to submit this single-chain batch.',
    };
  }
  if (capability === 'unsupported-path') {
    return {
      ...CAPABILITY_NOTICE[capability],
      title:
        scope === 'both'
          ? CAPABILITY_NOTICE[capability].title
          : `${scope === 'base' ? 'Base' : 'Arbitrum'} route unavailable`,
    };
  }
  return null;
}

export function InvestConfirmScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const preview = useInvestDepositPlanPreview();
  const { capability, pending, startFromDraft } = useInvestExecution();

  const ready = capability === 'ready';
  const canConnect = capability === 'connect-wallet';
  const hasPlanForScope = isDepositPlanForScope(preview.plan, invest.scope);
  const notice = capabilityNotice(
    capability,
    invest.scope,
    invest.baseFundingToken.symbol,
  );
  const ctaLabel = canConnect
    ? account.isConnecting
      ? CONNECTING_LABEL
      : CONNECT_WALLET_CTA
    : pending
      ? 'Refreshing plan…'
      : 'Start guided execution';

  return (
    <ScreenScrollView>
      <StepHeader title="Confirm" step="Step 3 of 3" />
      <StepProgress current={3} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Confirm investment
        </Text>
        <StrategyPlanSummary
          variant="confirm"
          plan={preview.plan}
          amountUsd={preview.amountUsd}
          scope={invest.scope}
          singleChainFundingDraft={invest.singleChainFundingDraft}
          baseToken={invest.baseFundingToken}
          arbitrumToken={invest.arbitrumFundingToken}
        />

        {invest.scope === 'both' ? (
          <MockBridgeNotice
            title="Mock bridge does not transfer assets"
            body="You will approve and submit each action manually. Before the Arbitrum group starts, the app checks this wallet's real balance again."
          />
        ) : null}

        {notice ? (
          <View className="mt-4">
            <NonCustodialCard title={notice.title} body={notice.body} />
          </View>
        ) : null}
        <PrimaryButton
          className="mt-5"
          disabled={
            account.isConnecting ||
            pending ||
            preview.amountUsd <= 0 ||
            !hasPlanForScope ||
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
          {invest.scope === 'both'
            ? 'No custody and no automatic signatures. Confirm one wallet action at a time.'
            : 'No custody and no automatic signatures. Confirm the wallet batch in Privy or Ambire.'}
        </Text>
      </View>
    </ScreenScrollView>
  );
}
