import { tokens } from '@zapengine/design-tokens/tokens';
import { SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { PortfolioTrendChart } from '@/components/charts/PortfolioTrendChart';
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
import { formatSnapshotDate, isSnapshotToday } from '@/lib/portfolioDates';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import type { TranslationKey } from '@/i18n/translations';

const RANGE_OPTIONS = ['1W', '1M', '3M', '1Y', 'ALL'] as const;

const DEMO_PORTFOLIO: PortfolioViewData = {
  ...DEMO.portfolio,
  valueChangePct: DEMO.portfolio.changePct,
  valueChangeUsd: DEMO.portfolio.changeUsdAllTime,
  latestSnapshotChangePct: DEMO.portfolio.changePctToday,
  latestSnapshotDate: DEMO.home.latestSnapshotDate,
  trendPoints: DEMO.home.trendPoints,
};

const METRIC_TRANSLATION_KEYS: Readonly<Record<string, TranslationKey>> = {
  'Value change': 'portfolio.metric.valueChange',
  'Current APY': 'portfolio.metric.currentApy',
  '7D value change': 'portfolio.metric.valueChange7d',
  '30D value change': 'portfolio.metric.valueChange30d',
  'Max drawdown': 'portfolio.metric.maxDrawdown',
  Volatility: 'portfolio.metric.volatility',
  Sharpe: 'portfolio.metric.sharpe',
};

export function PortfolioScreen() {
  const [range, setRange] = useState<PortfolioRange>('1Y');
  const { languageCode, t } = useContentLanguage();
  const account = useAccount();
  const result = usePortfolioData(account.viewingUserId, range, {
    isResolvingUser: account.isResolvingViewingUser,
  });

  const isDemo = account.isDemo;
  const portfolio = isDemo ? DEMO_PORTFOLIO : result.data;
  const loading = !isDemo && result.isLoading;
  const trendPoints = portfolio?.trendPoints ?? [];
  const latestSnapshotLabel = isSnapshotToday(portfolio?.latestSnapshotDate)
    ? t('home.today')
    : formatSnapshotDate(portfolio?.latestSnapshotDate, languageCode);
  const localizedMetrics = (portfolio?.metrics ?? []).map((metric) => {
    const translationKey = METRIC_TRANSLATION_KEYS[metric.label];
    return {
      ...metric,
      label: translationKey ? t(translationKey) : metric.label,
    };
  });

  return (
    <ScreenScrollView>
      <ScreenHeader
        title={t('portfolio.title')}
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
        <SectionLabel>{t('portfolio.positionValue')}</SectionLabel>
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
          <Text
            className={`rounded-full px-[9px] py-[3px] font-sans-semibold text-[12.5px] ${
              typeof portfolio?.valueChangePct === 'number' &&
              portfolio.valueChangePct < 0
                ? 'bg-error/[0.12] text-error'
                : 'bg-success/[0.12] text-success'
            }`}
          >
            {typeof portfolio?.valueChangePct === 'number'
              ? formatSignedPct(portfolio.valueChangePct).replace('+', '')
              : '-'}
          </Text>
          <Text className="text-[13px] text-ink-dim">
            {typeof portfolio?.valueChangeUsd === 'number'
              ? `${formatSignedUsd(portfolio.valueChangeUsd)} ${t('portfolio.selectedRange', { range })}`
              : t('portfolio.selectedRange', { range })}
            {typeof portfolio?.latestSnapshotChangePct === 'number'
              ? ` · ${formatSignedPct(portfolio.latestSnapshotChangePct)}${latestSnapshotLabel ? ` ${latestSnapshotLabel}` : ''}`
              : ''}
          </Text>
        </View>
      </View>

      <View className="mt-3 px-5">
        <View className="flex-row items-center justify-between">
          <SectionLabel>{t('portfolio.valueHistory')}</SectionLabel>
          <RangeTabs
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
          />
        </View>
        <View className="mt-3 h-[170px] justify-center">
          {loading && trendPoints.length < 2 ? (
            <SkeletonBlock className="h-[158px] w-full rounded-2xl" />
          ) : trendPoints.length >= 2 ? (
            <PortfolioTrendChart
              trendPoints={trendPoints}
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
        <MetricsGrid className="mt-5 px-5" metrics={localizedMetrics} />
      )}

      <View className="mt-6 px-5">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {t('strategy.currentAllocation')}
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
            title={t('portfolio.nonCustodialTitle')}
            body={t('portfolio.nonCustodialBody')}
          />
        </View>
      </View>
    </ScreenScrollView>
  );
}
