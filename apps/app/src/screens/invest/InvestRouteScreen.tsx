import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import * as StrategyFlow from '@/components/invest/StrategyFlow';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import {
  useInvest,
  useInvestDepositPlanPreview,
} from '@/integration/useInvest';
import { formatUsd } from '@/lib/format';

function RailNode({
  title,
  badge,
  body,
  tone = 'chain',
}: {
  title: string;
  badge: string;
  body: string;
  tone?: 'chain' | 'mock';
}) {
  const color = tone === 'mock' ? '#d7bd70' : '#d4c5a3';
  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View
          className="h-8 w-8 items-center justify-center rounded-full border"
          style={{ borderColor: `${color}66`, backgroundColor: `${color}14` }}
        >
          <View
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
        </View>
        <View className="h-8 w-px bg-[rgba(212,197,163,.22)]" />
      </View>
      <View className="flex-1 pb-5 pt-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="font-sans-semibold text-[14px] text-ink">
            {title}
          </Text>
          <Text
            className="rounded-full px-2 py-0.5 font-mono text-[8px] uppercase tracking-[.5px]"
            style={{ color, backgroundColor: `${color}12` }}
          >
            {badge}
          </Text>
        </View>
        <Text className="mt-1 text-[11.5px] leading-[17px] text-ink-dim">
          {body}
        </Text>
      </View>
    </View>
  );
}

export function InvestRouteScreen() {
  const router = useRouter();
  const invest = useInvest();
  const preview = useInvestDepositPlanPreview();

  return (
    <ScreenScrollView>
      <StrategyFlow.StepHeader title="Route" step="Step 2 of 3" />
      <StrategyFlow.StepProgress current={2} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Preview route
        </Text>
        <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
          {formatUsd(preview.amountUsd)} across Morpho and two GMX markets.
        </Text>

        <StrategyFlow.StrategyPlanSummary
          variant="route"
          plan={preview.plan}
          amountUsd={preview.amountUsd}
          baseToken={invest.baseFundingToken}
          arbitrumToken={invest.arbitrumFundingToken}
        />

        <Card className="mt-4 px-4 pb-1 pt-4">
          {preview.isLoading ? (
            <View className="gap-3 pb-4">
              <SkeletonBlock className="h-[68px] w-full rounded-xl" />
              <SkeletonBlock className="h-[68px] w-full rounded-xl" />
              <SkeletonBlock className="h-[68px] w-full rounded-xl" />
            </View>
          ) : preview.plan ? (
            <>
              <RailNode
                title="Morpho Moonwell USDC"
                badge="Base · 40%"
                body={`${invest.baseFundingToken.symbol} funding with separate approval, same-chain swap when needed, and vault deposit confirmations.`}
              />
              <RailNode
                title="Mock bridge checkpoint"
                badge="No transaction"
                tone="mock"
                body="No assets move between chains. The next group rechecks the wallet's real Arbitrum balance."
              />
              <RailNode
                title="GMX BTC/USDC + ETH/USDC"
                badge="Arbitrum · 30/30"
                body={`${invest.arbitrumFundingToken.symbol} funding with separate approvals, same-chain USDC swaps when needed, and two asynchronous GMX deposits.`}
              />
            </>
          ) : (
            <View className="pb-4">
              <Text className="font-sans-semibold text-[14px] text-ink">
                {preview.isError
                  ? 'Route unavailable'
                  : 'Route preview pending'}
              </Text>
              <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
                {preview.isError
                  ? 'The live quote could not be prepared.'
                  : 'Connect a wallet and enter an amount to fetch the live plan.'}
              </Text>
              {preview.isError && preview.errorMessage ? (
                <Text className="mt-2 text-[11.5px] leading-[17px] text-[#ef9292]">
                  {preview.errorMessage}
                </Text>
              ) : null}
              {preview.isError ? (
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel="Retry route preview"
                  className="mt-3 self-start rounded-full border px-3 py-1.5"
                  style={{
                    borderColor: 'rgba(212,197,163,.22)',
                    backgroundColor: 'rgba(212,197,163,.07)',
                  }}
                  onPress={preview.retry}
                >
                  <Text className="font-sans-semibold text-[11px] text-accent">
                    Retry
                  </Text>
                </Tap>
              ) : null}
            </View>
          )}
        </Card>

        <StrategyFlow.MockBridgeNotice
          title="Mock bridge — development only"
          body={`Arbitrum must already hold enough ${invest.arbitrumFundingToken.symbol} plus ETH for gas and GMX keeper execution fees.`}
        />

        <PrimaryButton
          className="mt-5"
          disabled={!preview.plan || preview.isLoading || preview.isError}
          onPress={() => router.push('/invest/confirm')}
        >
          Continue
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
