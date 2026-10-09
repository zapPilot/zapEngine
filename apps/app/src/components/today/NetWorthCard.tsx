import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { tokens } from '@zapengine/design-tokens/tokens';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Tap } from '@/components/ui/Tap';
import { Badge } from '@/components/ui/Badge';
import { Callout } from '@/components/ui/Callout';
import { DisplayUsdValue } from '@/components/ui/DisplayUsdValue';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PortfolioTrendChart } from '@/components/charts/PortfolioTrendChart';
import { PortfolioImportState } from '@/components/home/PortfolioImportState';
import { HomeAttributionBreakdown } from '@/components/home/HomeAttributionBreakdown';
import { ReadOnlyBundleBanner } from '@/components/home/ReadOnlyBundleBanner';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { HOME_RANGE_OPTIONS } from '@/integration/useHomeData';
import { formatUsd, formatSignedPct, formatSignedUsd } from '@/lib/format';
import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';
import { useFundFlow } from '@/providers/FundFlowProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import type { useTodayPortfolio } from './useTodayPortfolio';
export function NetWorthCard({
  portfolio: p,
}: {
  portfolio: ReturnType<typeof useTodayPortfolio>;
}) {
  const { t } = useContentLanguage();
  const router = useRouter();
  const fund = useFundFlow();
  const auth = useAuthenticatedAction();
  const { account, result, etl } = p;
  const home = result.data.home;
  const loading =
    !account.isDemo && result.balance.isLoading && !etl.isInProgress;
  const importing =
    account.isOwnBundle &&
    !account.isDemo &&
    !loading &&
    result.snapshotAvailability === 'unavailable';
  const failed = etl.status === 'failed';
  const unverified =
    etl.errorMessage?.includes('ownership has not been verified') === true;
  const importTitle = unverified
    ? t('home.etlNeedsVerificationTitle')
    : failed
      ? t('home.etlFailedTitle')
      : etl.status === 'completed'
        ? t('home.noPortfolioHistoryTitle')
        : t('home.etlPreparingTitle');
  const importBody = unverified
    ? t('home.etlNeedsVerificationBody')
    : failed
      ? t('home.etlFailedBody')
      : etl.status === 'completed'
        ? t('home.noPortfolioHistoryBody')
        : t('home.etlPreparingBody');
  const label = [
    t('home.netWorth'),
    typeof home.totalBalance === 'number' ? formatUsd(home.totalBalance) : '—',
    t('home.viewPortfolio'),
  ].join(', ');
  const chartId = 'todayNetWorth';
  return (
    <View className="gap-3">
      <ReadOnlyBundleBanner
        walletCount={p.addresses.length}
        address={p.addresses[0] ?? null}
      />
      <Card padding="md" className="gap-4">
        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="muted">
            {t('home.netWorth')}
          </Text>
          {account.isDemo ? (
            <Badge tone="secondary">{t('today.demo')}</Badge>
          ) : null}
        </View>
        {account.isUserResolutionFailed ? (
          <Callout
            tone="alert"
            title={t('account.unavailableTitle')}
            body={t('account.unavailableBody')}
            action={{
              label: t('common.retry'),
              onPress: () => void account.retryUserResolution(),
            }}
          />
        ) : importing ? (
          <PortfolioImportState
            title={importTitle}
            body={importBody}
            {...(failed && !unverified && Platform.OS !== 'ios'
              ? { retryLabel: t('common.retry'), onRetry: p.retryImport }
              : {})}
          />
        ) : (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => router.push('/portfolio')}
          >
            <DisplayUsdValue
              size="lg"
              value={home.totalBalance}
              loading={loading}
            />
            <View className="mt-2 flex-row gap-2">
              <Text
                variant="data"
                tone={
                  home.rangeChangeUsd !== null && home.rangeChangeUsd < 0
                    ? 'down'
                    : 'up'
                }
              >
                {home.rangeChangeUsd === null
                  ? '—'
                  : formatSignedUsd(home.rangeChangeUsd)}
              </Text>
              <Text variant="caption" tone="muted">
                {home.rangeChangePct === null
                  ? '—'
                  : formatSignedPct(home.rangeChangePct)}
              </Text>
            </View>
          </Tap>
        )}
        <SegmentedControl
          accessibilityLabel={t('common.chartRange')}
          options={HOME_RANGE_OPTIONS.map((value) => ({
            value,
            label: value,
            accessibilityLabel: value,
          }))}
          value={p.range}
          onChange={p.setRange}
        />
        {result.trend.isLoading ? (
          <SkeletonBlock className="h-24 rounded-panel" />
        ) : importing ? null : (
          <PortfolioTrendChart
            trendPoints={home.trendPoints}
            height={tokens.space[8]}
            gradientId={chartId}
          />
        )}
        <HomeAttributionBreakdown summary={home.attribution} />
        <View className="flex-row gap-3">
          {fund.available ? (
            <Button
              className="flex-1"
              disabled={account.viewingUserId !== null && !account.isOwnBundle}
              onPress={() =>
                auth.run(() => fund.open({ fresh: fund.signRequest === null }))
              }
            >
              {t('fund.title')}
            </Button>
          ) : null}
          <Button
            className="flex-1"
            variant="secondary"
            onPress={() => router.push('/portfolio')}
          >
            {t('home.viewPortfolio')}
          </Button>
        </View>
      </Card>
    </View>
  );
}
