import { tokens } from '@zapengine/design-tokens/tokens';
import { useRouter } from 'expo-router';
import { ArrowRight, Info, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { AllocationBar } from '@/components/charts/AllocationBar';
import { Pill } from '@/components/ui/Pill';
import { MetricsGrid } from '@/components/metrics/MetricsGrid';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MetricsGridSkeleton } from '@/components/metrics/MetricsGridSkeleton';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { Sparkline } from '@/components/charts/Sparkline';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { DEMO } from '@/data/demo';
import {
  RANGE_OPTIONS,
  type StrategyRange,
  strategyBacktestDaysForRange,
} from '@/integration/strategyRanges';
import { useAccount } from '@/integration/useAccount';
import { useStrategyData } from '@/integration/useStrategyData';
import { createStrategyStartAction } from '@/integration/strategyStartAction';
import { resolveColor } from '@/lib/colors';
import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';

export function StrategyScreen() {
  const router = useRouter();
  const authAction = useAuthenticatedAction();
  const [range, setRange] = useState<StrategyRange>('1Y');
  const account = useAccount();
  const result = useStrategyData(
    account.userId,
    account.isConnected,
    strategyBacktestDaysForRange(range),
  );

  const isDemo = !account.isConnected;
  const strategy = result.data ?? DEMO.strategy;
  const loading = !isDemo && result.isLoading;
  const chartData =
    result.data?.backtest.chartData && result.data.backtest.chartData.length > 1
      ? result.data.backtest.chartData
      : DEMO.home.sparkline;
  const allocation = strategy.backtest.allocation;
  const sentiment =
    typeof strategy.backtest.sentiment === 'number'
      ? strategy.backtest.sentiment
      : 50;
  const startStrategy = createStrategyStartAction(authAction.run, () =>
    router.push('/invest/amount'),
  );

  return (
    <ScreenScrollView>
      <View className="flex-row items-start justify-between px-5 pt-2">
        <View>
          <Text className="font-serif text-[27px] leading-[31px] text-ink">
            Zap Strategy
          </Text>
          <Text className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.99px] text-[#9a8f78]">
            Disciplined Portfolio Autopilot
          </Text>
        </View>
        <Tap className="h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-[rgba(255,255,255,.05)]">
          <Info size={17} strokeWidth={1.8} color={tokens.color['ink-dim']} />
        </Tap>
      </View>

      <View className="mx-5 mt-5 flex-row items-center justify-between">
        <Text className="font-sans-semibold text-[14px] text-ink">
          Backtest
        </Text>
        <RangeTabs
          options={RANGE_OPTIONS}
          value={range}
          onChange={(value) => setRange(value as StrategyRange)}
        />
      </View>

      <Card className="mx-5 mt-3 p-[15px]">
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="font-mono text-[9px] uppercase tracking-[0.9px] text-[#9a8f78]">
              {isDemo ? 'Zap Strategy · 1Y return' : 'Default backtest · ROI'}
            </Text>
            {loading ? (
              <SkeletonBlock className="mt-1 h-8 w-24 rounded-lg" />
            ) : (
              <Text className="mt-0.5 font-serif text-[30px] leading-[33px] text-success">
                {strategy.backtest.returnLabel}
              </Text>
            )}
          </View>
          <View className="items-end">
            <Text className="font-mono text-[9px] leading-[15px] text-ink-faint">
              {strategy.backtest.vsBtcLabel}
            </Text>
            <Text className="font-mono text-[9px] leading-[15px] text-ink-faint">
              {strategy.backtest.vsEthLabel}
            </Text>
          </View>
        </View>
        <View className="mt-4 h-[150px] justify-center">
          {loading && chartData.length < 2 ? (
            <SkeletonBlock className="h-[138px] w-full rounded-2xl" />
          ) : (
            <Sparkline
              data={chartData}
              height={138}
              gradientId="strategyBacktestSpark"
            />
          )}
        </View>
      </Card>

      {loading ? (
        <MetricsGridSkeleton className="mt-5 px-5" count={8} />
      ) : (
        <MetricsGrid
          className="mt-5 px-5"
          metrics={strategy.backtest.metrics}
        />
      )}

      <Card className="mx-5 mt-6 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-[15px] text-ink">
            Current positioning
          </Text>
          <Pill className="border border-line bg-[rgba(255,255,255,.05)]">
            {strategy.backtest.currentModeLabel}
          </Pill>
        </View>
        <AllocationBar
          className="mt-3"
          height={9}
          segments={allocation.map((item) => ({
            color: item.color,
            value: item.pct,
          }))}
        />
        <View className="mt-3 gap-2">
          {allocation.map((item) => (
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

      <Card className="mx-5 mt-4 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-[15px] text-ink">
            Fear and greed
          </Text>
          <Text className="font-mono text-[12px] text-accent">
            {Math.round(sentiment)}
          </Text>
        </View>
        <View className="mt-3 h-2 rounded-full bg-[rgba(255,255,255,.08)]">
          <View
            className="h-2 rounded-full bg-accent"
            style={{ width: `${Math.max(0, Math.min(100, sentiment))}%` }}
          />
        </View>
        <Text className="mt-3 font-serif text-[18px] italic text-[#d4cdbc]">
          {`"${strategy.quote}"`}
        </Text>
      </Card>

      {result.data && !result.data.hasTargetAllocation && !isDemo ? (
        <View className="mx-5 mt-4 flex-row gap-2 rounded-2xl border border-[rgba(255,111,97,.25)] bg-[rgba(255,111,97,.08)] p-3">
          <TriangleAlert
            size={17}
            strokeWidth={1.8}
            color={tokens.color.error}
          />
          <Text className="flex-1 text-[12px] leading-[18px] text-error">
            Strategy allocation is unavailable for this account.
          </Text>
        </View>
      ) : null}

      <View className="mx-5 mt-5">
        <PrimaryButton onPress={startStrategy}>
          <Text className="font-sans-semibold text-[15.5px] text-[#0a0a0a]">
            Start with Zap Strategy
          </Text>
          <ArrowRight size={16} strokeWidth={1.8} color="#0a0a0a" />
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
