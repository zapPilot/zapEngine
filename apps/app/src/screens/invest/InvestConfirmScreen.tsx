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
  scope: ReturnType<typeof useInvest>['scope'],
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

export function InvestConfirmScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const preview = useInvestDepositPlanPreview();
  const { capability, pending, startFromDraft } = useInvestExecution();

  const ready = capability === 'ready';
  const canConnect = capability === 'connect-wallet';
  const hasPlanForScope =
    invest.scope === 'both'
      ? StrategyFlow.isStrategyDepositPlan(preview.plan)
      : Boolean(
          preview.plan &&
          !StrategyFlow.isStrategyDepositPlan(preview.plan) &&
          preview.plan.sourceChainId ===
            (invest.scope === 'base' ? 8453 : 42161),
        );
  const capabilityNotice = canConnect
    ? {
        title: 'Connect your wallet',
        body: connectWalletBody(invest.scope, invest.baseFundingToken.symbol),
      }
    : capability === 'unsupported-wallet'
      ? {
          ...CAPABILITY_NOTICE[capability],
          body:
            invest.scope === 'both'
              ? CAPABILITY_NOTICE[capability].body
              : 'Use Privy or an Ambire EIP-7702 wallet to submit this single-chain batch.',
        }
      : capability === 'unsupported-path'
        ? {
            ...CAPABILITY_NOTICE[capability],
            title:
              invest.scope === 'both'
                ? CAPABILITY_NOTICE[capability].title
                : `${invest.scope === 'base' ? 'Base' : 'Arbitrum'} route unavailable`,
          }
        : null;
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
          scope={invest.scope}
          singleChainFundingDraft={invest.singleChainFundingDraft}
          baseToken={invest.baseFundingToken}
          arbitrumToken={invest.arbitrumFundingToken}
        />

        {invest.scope === 'both' ? (
          <StrategyFlow.MockBridgeNotice
            title="Mock bridge does not transfer assets"
            body="You will approve and submit each action manually. Before the Arbitrum group starts, the app checks this wallet's real balance again."
          />
        ) : null}

        {capabilityNotice ? (
          <View className="mt-4">
            <NonCustodialCard
              title={capabilityNotice.title}
              body={capabilityNotice.body}
            />
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
