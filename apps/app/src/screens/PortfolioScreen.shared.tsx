import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AllocationSummary } from '@/components/ui/AllocationSummary';
import { PortfolioTrendChart } from '@/components/charts/PortfolioTrendChart';
import { StatGrid } from '@/components/ui/StatGrid';

import { SharePortfolioButton } from '@/components/share/SharePortfolioButton';
import { DisplayUsdValue } from '@/components/ui/DisplayUsdValue';
import { Callout } from '@/components/ui/Callout';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { DEMO } from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import {
  DEFAULT_PORTFOLIO_RANGE,
  type PortfolioRange,
  type PortfolioViewData,
  usePortfolioData,
} from '@/integration/usePortfolioData';
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
  const router = useRouter();
  const [range, setRange] = useState<PortfolioRange>(DEFAULT_PORTFOLIO_RANGE);
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
    <ScreenScrollView width="dashboard">
      <PageHeader
        title={t('portfolio.title')}
        leading={
          <IconButton
            icon={ArrowLeft}
            accessibilityLabel={t('common.back')}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/home');
            }}
          />
        }
        actions={<SharePortfolioButton />}
      />

      <View className="px-5 pt-4">
        <SectionHeader title={t('portfolio.positionValue')} />
        <View className="mt-[5px]">
          <DisplayUsdValue
            size="lg"
            loading={loading && portfolio === null}
            value={portfolio?.positionValue ?? null}
          />
        </View>
        <View className="mt-[9px] flex-row items-center gap-2">
          <Text
            className={`rounded-full px-[9px] py-[3px] font-sans-semibold text-[12.5px] ${
              typeof portfolio?.valueChangePct === 'number' &&
              portfolio.valueChangePct < 0
                ? 'bg-danger-soft text-danger'
                : 'bg-success-soft text-success'
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
          <SectionHeader title={t('portfolio.valueHistory')} />
          <SegmentedControl
            accessibilityLabel={t('common.chartRange')}
            options={RANGE_OPTIONS.map((option) => ({
              value: option,
              label: option,
              accessibilityLabel: option,
            }))}
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
        <StatGrid loading className="mt-5 px-5" count={6} />
      ) : (
        <StatGrid className="mt-5 px-5" metrics={localizedMetrics} />
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
        <View className="mt-3">
          <AllocationSummary
            items={portfolio?.allocation ?? []}
            emptyLabel={t('portfolio.noAllocation')}
          />
        </View>
        <View className="mt-4">
          <Callout
            tone="info"
            title={t('portfolio.nonCustodialTitle')}
            body={t('portfolio.nonCustodialBody')}
          />
        </View>
      </View>
    </ScreenScrollView>
  );
}
