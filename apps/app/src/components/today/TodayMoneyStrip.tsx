import { useContext, useMemo } from 'react';
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
import { ContentWidthContext } from '@/components/ui/contentWidthContext';
import { Sparkline } from '@/components/charts/Sparkline';
import { PortfolioImportState } from '@/components/home/PortfolioImportState';
import { ReadOnlyBundleBanner } from '@/components/home/ReadOnlyBundleBanner';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { todayMoney } from '@/integration/todayModel';
import { cn } from '@/lib/cn';
import { formatUsd, formatSignedPct, formatSignedUsd } from '@/lib/format';
import { columnCountFor } from '@/lib/layout';
import { formatSnapshotDate } from '@/lib/portfolioDates';
import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';
import { useFundFlow } from '@/providers/FundFlowProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import type { useTodayPortfolio } from './useTodayPortfolio';
/** Net worth as today's number: the value, what changed since the last snapshot, a month of shape. */
export function TodayMoneyStrip({
  portfolio: p,
}: {
  portfolio: ReturnType<typeof useTodayPortfolio>;
}) {
  const { t, languageCode } = useContentLanguage();
  const router = useRouter();
  const fund = useFundFlow();
  const auth = useAuthenticatedAction();
  const wide = columnCountFor(useContext(ContentWidthContext)) === 2;
  const { account, result, etl } = p;
  const home = result.data.home;
  const money = useMemo(() => todayMoney(home.trendPoints), [home.trendPoints]);
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
  const snapshot = formatSnapshotDate(money.asOf, languageCode);
  const since = formatSnapshotDate(money.sinceDate, languageCode);
  const change = money.change;
  const sparkline = result.trend.isLoading ? (
    <SkeletonBlock className="h-16 rounded-panel" />
  ) : importing || money.spark.length < 2 ? null : (
    <View testID="today-sparkline" className={wide ? 'flex-1' : 'w-full'}>
      <Sparkline data={money.spark} height={tokens.space[7]} />
    </View>
  );
  return (
    <View className="gap-3">
      <ReadOnlyBundleBanner
        walletCount={p.addresses.length}
        address={p.addresses[0] ?? null}
      />
      <Card padding="md" className="gap-4">
        <View className={cn('gap-4', wide ? 'flex-row items-end gap-10' : '')}>
          <View className={cn('gap-4', wide ? 'flex-1' : '')}>
            <View className="flex-row flex-wrap items-center gap-3">
              <Text variant="label" tone="muted">
                {t('home.netWorth')}
              </Text>
              {snapshot ? (
                <Text variant="label" tone="muted">
                  {t('today.snapshot', { date: snapshot })}
                </Text>
              ) : null}
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
                <View className="mt-2 flex-row flex-wrap items-baseline gap-2">
                  <Text
                    variant="data"
                    tone={change !== null && change.usd < 0 ? 'down' : 'up'}
                  >
                    {change === null ? '—' : formatSignedUsd(change.usd)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {change === null || change.pct === null
                      ? '—'
                      : formatSignedPct(change.pct)}
                  </Text>
                  {change === null ? null : (
                    <Text variant="caption" tone="muted">
                      {since
                        ? t('strategy.signals.since', { date: since })
                        : t('today.dayChange')}
                    </Text>
                  )}
                </View>
              </Tap>
            )}
            <View className="flex-row gap-3">
              {fund.available ? (
                <Button
                  className="flex-1"
                  disabled={
                    account.viewingUserId !== null && !account.isOwnBundle
                  }
                  onPress={() =>
                    auth.run(() =>
                      fund.open({ fresh: fund.signRequest === null }),
                    )
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
          </View>
          {sparkline}
        </View>
      </Card>
    </View>
  );
}
