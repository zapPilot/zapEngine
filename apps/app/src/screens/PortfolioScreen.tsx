import { tokens } from '@zapengine/design-tokens/tokens';
import { SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { Sparkline } from '@/components/charts/Sparkline';
import { MetricsGrid } from '@/components/metrics/MetricsGrid';
import { MetricsGridSkeleton } from '@/components/metrics/MetricsGridSkeleton';
import { SharePortfolioButton } from '@/components/share/SharePortfolioButton';
import { Card } from '@/components/ui/Card';
import { DisplayUsdValue } from '@/components/ui/DisplayUsdValue';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { DEMO } from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import {
  type PortfolioRange,
  type PortfolioViewData,
  usePortfolioData,
} from '@/integration/usePortfolioData';
import { resolveColor } from '@/lib/colors';
import { formatSignedPct, formatSignedUsd } from '@/lib/format';

const RANGE_OPTIONS = ['1W', '1M', '3M', '1Y', 'ALL'] as const;

const DEMO_PORTFOLIO: PortfolioViewData = {
  ...DEMO.portfolio,
  chartData: DEMO.home.sparkline,
};

export function PortfolioScreen() {
  const [range, setRange] = useState<PortfolioRange>('1Y');
  const account = useAccount();
  const result = usePortfolioData(account.viewingUserId, range, {
    isResolvingUser: account.isResolvingViewingUser,
  });

  const isDemo = account.isDemo;
  const portfolio = isDemo ? DEMO_PORTFOLIO : result.data;
  const loading = !isDemo && result.isLoading;
  const chartData = portfolio?.chartData ?? [];

  return (
    <ScreenScrollView>
      <ScreenHeader
        title="Portfolio"
        left={<ScreenBackButton fallbackHref="/home" />}
        right={
          <View className="flex-row items-center gap-2">
            <SharePortfolioButton />
            <Tap className="h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-[rgba(255,255,255,.05)]">
              <SlidersHorizontal
                size={17}
                strokeWidth={1.8}
                color={tokens.color['ink-dim']}
              />
            </Tap>
          </View>
        }
      />

      <View className="px-5 pt-4">
        <SectionLabel>Strategy position value</SectionLabel>
        <View className="mt-[5px]">
          <DisplayUsdValue
            loading={loading && portfolio === null}
            value={portfolio?.positionValue ?? null}
            valueClassName="font-serif text-[50px] leading-[54px] text-ink"
            fractionClassName="text-[32px] text-ink-faint"
            skeletonClassName="h-[51px] w-[190px] rounded-xl"
            emptyClassName="text-ink-faint"
          />
        </View>
        <View className="mt-[9px] flex-row items-center gap-2">
          <Text className="rounded-full bg-[rgba(122,216,143,.12)] px-[9px] py-[3px] font-sans-semibold text-[12.5px] text-success">
            {typeof portfolio?.changePct === 'number'
              ? formatSignedPct(portfolio.changePct).replace('+', '')
              : '-'}
          </Text>
          <Text className="text-[13px] text-ink-dim">
            {typeof portfolio?.changeUsdAllTime === 'number' &&
            typeof portfolio?.changePctToday === 'number'
              ? `${formatSignedUsd(portfolio.changeUsdAllTime)} all time · ${formatSignedPct(portfolio.changePctToday)} today`
              : 'all time · today'}
          </Text>
        </View>
      </View>

      <View className="mt-3 px-5">
        <View className="flex-row items-center justify-between">
          <SectionLabel>Value history</SectionLabel>
          <RangeTabs
            options={RANGE_OPTIONS}
            value={range}
            onChange={(value) => setRange(value as PortfolioRange)}
          />
        </View>
        <View className="mt-3 h-[170px] justify-center">
          {loading && chartData.length < 2 ? (
            <SkeletonBlock className="h-[158px] w-full rounded-2xl" />
          ) : chartData.length >= 2 ? (
            <Sparkline
              data={chartData}
              height={158}
              gradientId="portfolioValueSpark"
            />
          ) : (
            <Text className="text-center font-mono text-[18px] text-ink-faint">
              -
            </Text>
          )}
        </View>
      </View>

      {loading && portfolio === null ? (
        <MetricsGridSkeleton className="mt-5 px-5" count={6} />
      ) : (
        <MetricsGrid className="mt-5 px-5" metrics={portfolio?.metrics ?? []} />
      )}

      <View className="mt-6 px-5">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-[15px] text-ink">
            Current allocation
          </Text>
          <Text className="font-mono text-[9.5px] text-ink-faint">
            High-level
          </Text>
        </View>
        <Card className="mt-3 p-4">
          <AllocationBar
            height={11}
            segments={(portfolio?.allocation ?? []).map((item) => ({
              color: item.color,
              value: item.pct,
            }))}
          />
          <View className="mt-[13px] gap-[9px]">
            {(portfolio?.allocation ?? []).map((item) => (
              <View
                key={item.label}
                className="flex-row items-center justify-between"
              >
                <View className="flex-row items-center gap-2">
                  <View
                    className="h-[9px] w-[9px] rounded-full"
                    style={{ backgroundColor: resolveColor(item.color) }}
                  />
                  <Text className="text-[13px] text-ink-dim">{item.label}</Text>
                </View>
                <Text className="font-mono text-[12.5px] text-ink">
                  {item.pct}%
                </Text>
              </View>
            ))}
          </View>
        </Card>
        <View className="mt-4">
          <NonCustodialCard
            title="Non-custodial execution"
            body="Zap Pilot prepares transactions; your wallet signs every move."
          />
        </View>
      </View>
    </ScreenScrollView>
  );
}
