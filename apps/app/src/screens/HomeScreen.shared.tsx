import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import { useUserWallets } from '@zapengine/app-core/hooks/queries/wallet/useUserWallets';
import { Platform, Text, View } from 'react-native';
import { HomeWalletSearch } from '@/components/home/HomeWalletSearch';
import { ReadOnlyBundleBanner } from '@/components/home/ReadOnlyBundleBanner';
import {
  type EtlJobPollingState,
  useEtlJobPolling,
} from '@zapengine/app-core/hooks/wallet/useEtlJobPolling';
import { useRouter } from 'expo-router';
import { ArrowRight, RefreshCw, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { PortfolioTrendChart } from '@/components/charts/PortfolioTrendChart';
import { AssetListSkeleton, AssetRow } from '@/components/home/AssetRow';
import {
  AccountUnavailableOverlay,
  DemoBlurCover,
  DemoConnectOverlay,
} from '@/components/home/DemoConnectOverlay';
import { HomeActionRow } from '@/components/home/HomeActionRow';
import { HomeAttributionBreakdown } from '@/components/home/HomeAttributionBreakdown';
import { HomeIncomeCard } from '@/components/home/HomeIncomeCard';
import { Callout } from '@/components/ui/Callout';
import { PortfolioImportState } from '@/components/home/PortfolioImportState';
import { StrategyStatusCard } from '@/components/home/StrategyStatusCard';
import { SharePortfolioButton } from '@/components/share/SharePortfolioButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { DisplayUsdValue } from '@/components/ui/DisplayUsdValue';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { DEMO } from '@/data/demo';
import type { TranslationKey } from '@/i18n/translations';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { useAccount } from '@/integration/useAccount';
import {
  DEFAULT_HOME_RANGE,
  HOME_RANGE_OPTIONS,
  type HomeRange,
  useHomeData,
} from '@/integration/useHomeData';
import { useHomeIncome } from '@/integration/useHomeIncome';
import { STRATEGY_DECISION_FOCUS_HREF } from '@/integration/strategyFocus';
import {
  normalizeWalletAddressList,
  useWalletAssets,
} from '@/integration/walletTokens';
import { formatSignedPct, formatSignedUsd, formatUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

type PortfolioImportCopyKey =
  | 'failed'
  | 'completed'
  | 'preparing'
  | 'needsVerification';

const PORTFOLIO_IMPORT_COPY = {
  failed: {
    titleKey: 'home.etlFailedTitle',
    bodyKey: 'home.etlFailedBody',
    retryable: true,
  },
  completed: {
    titleKey: 'home.noPortfolioHistoryTitle',
    bodyKey: 'home.noPortfolioHistoryBody',
    retryable: false,
  },
  preparing: {
    titleKey: 'home.etlPreparingTitle',
    bodyKey: 'home.etlPreparingBody',
    retryable: false,
  },
  needsVerification: {
    titleKey: 'home.etlNeedsVerificationTitle',
    bodyKey: 'home.etlNeedsVerificationBody',
    retryable: false,
  },
} as const satisfies Record<
  PortfolioImportCopyKey,
  { titleKey: TranslationKey; bodyKey: TranslationKey; retryable: boolean }
>;

function getPortfolioImportCopy(
  status: EtlJobPollingState['status'],
  needsVerification: boolean,
) {
  if (needsVerification) return PORTFOLIO_IMPORT_COPY.needsVerification;
  if (status === 'failed') return PORTFOLIO_IMPORT_COPY.failed;
  if (status === 'completed') return PORTFOLIO_IMPORT_COPY.completed;
  return PORTFOLIO_IMPORT_COPY.preparing;
}

export function HomeScreen() {
  const router = useRouter();
  const { t } = useContentLanguage();
  const [range, setRange] = useState<HomeRange>(DEFAULT_HOME_RANGE);
  const account = useAccount();
  const {
    state: etlState,
    startPolling: startEtlPolling,
    triggerEtl,
  } = useEtlJobPolling();
  const { data, balance, trend, strategy, snapshotAvailability } = useHomeData(
    account.viewingUserId,
    range,
    {
      isResolvingSubject: account.isResolvingViewingUser,
      isEtlInProgress: account.isOwnBundle && etlState.isInProgress,
    },
  );
  const homeIncome = useHomeIncome(account.viewingUserId);
  // One normalization feeds both the balance query and the wallet count, so
  // the footer can never disagree with the bundle the query actually fetched.
  const bundleWallets = useUserWallets(
    account.isOwnBundle ? null : account.viewingUserId,
  );
  const ownWalletAddresses = normalizeWalletAddressList(
    account.isOwnBundle
      ? account.walletAddresses
      : (bundleWallets.data?.map((wallet) => wallet.wallet) ?? []),
  );
  const walletAssets = useWalletAssets(ownWalletAddresses);

  useEffect(() => {
    if (
      account.isOwnBundle &&
      snapshotAvailability === 'unavailable' &&
      account.etlJobId &&
      etlState.jobId !== account.etlJobId
    ) {
      startEtlPolling(account.etlJobId, account.userId);
    }
  }, [
    account.etlJobId,
    account.isOwnBundle,
    account.userId,
    etlState.jobId,
    snapshotAvailability,
    startEtlPolling,
  ]);

  const isDemo = account.isDemo;
  const { home, strategyStatus } = data;
  const showBalanceSkeleton =
    !isDemo && balance.isLoading && !etlState.isInProgress;
  const showPortfolioImportState =
    account.isOwnBundle &&
    !isDemo &&
    !showBalanceSkeleton &&
    snapshotAvailability === 'unavailable';
  const portfolioNeedsVerification = etlState.errorMessage?.includes(
    'ownership has not been verified',
  );
  const portfolioImportCopy = getPortfolioImportCopy(
    etlState.status,
    portfolioNeedsVerification ?? false,
  );
  const retryPortfolioImport = () => {
    if (account.userId && account.address) {
      void triggerEtl(account.userId, account.address);
    }
  };
  const connect = () => requestAccountConnection(account);
  const retryWalletAssets = () => {
    void walletAssets.refetch();
    if (!account.isOwnBundle && account.viewingUserId)
      void bundleWallets.refetch();
  };
  const displayedAssets = isDemo ? DEMO.home.assets : walletAssets.assets;
  const walletCount = ownWalletAddresses.length;
  const walletAssetsTotal = isDemo
    ? displayedAssets.reduce((total, asset) => total + (asset.usdValue ?? 0), 0)
    : walletAssets.totalUsdValue;
  const isStrategyActionRequired = strategyStatus?.status === 'action_required';

  return (
    <ScreenScrollView width="dashboard">
      <PageHeader
        title={t('tabs.home')}
        brand
        actions={<SharePortfolioButton />}
      />

      <HomeWalletSearch />
      <ReadOnlyBundleBanner
        walletCount={walletCount}
        address={ownWalletAddresses[0] ?? null}
      />

      <View className="relative">
        <View className="pt-6">
          <View className="flex-row items-center justify-between">
            <SectionHeader title={t('home.netWorth')} />
            <Tap
              accessibilityRole="button"
              className="flex-row items-center gap-1 py-1"
              onPress={() => router.push('/portfolio')}
            >
              <Text className="font-text-semibold text-label text-ink">
                {t('home.viewPortfolio')}
              </Text>
              <Icon icon={ArrowRight} size="xs" tone="default" />
            </Tap>
          </View>

          {showPortfolioImportState ? (
            <View className="mt-3">
              <PortfolioImportState
                title={t(portfolioImportCopy.titleKey)}
                body={t(portfolioImportCopy.bodyKey)}
                retryLabel={
                  portfolioImportCopy.retryable && Platform.OS !== 'ios'
                    ? t('common.retry')
                    : undefined
                }
                onRetry={
                  portfolioImportCopy.retryable && Platform.OS !== 'ios'
                    ? retryPortfolioImport
                    : undefined
                }
              />
            </View>
          ) : (
            <Tap
              accessibilityLabel={`${t('home.netWorth')}, ${typeof home.totalBalance === 'number' ? formatUsd(home.totalBalance) : '-'}, ${t('home.viewPortfolio')}`}
              accessibilityRole="button"
              onPress={() => router.push('/portfolio')}
            >
              <DisplayUsdValue
                size="lg"
                className="mt-2"
                loading={showBalanceSkeleton}
                value={home.totalBalance}
              />
              <View className="mt-[9px] flex-row items-center gap-2">
                <Text
                  className={cn(
                    'rounded-round px-[9px] py-[3px] font-text-semibold text-caption',
                    typeof home.rangeChangePct === 'number' &&
                      home.rangeChangePct < 0
                      ? 'bg-alert-wash text-alert'
                      : 'bg-well text-ink',
                  )}
                >
                  {typeof home.rangeChangePct === 'number'
                    ? formatSignedPct(home.rangeChangePct)
                    : '-'}
                </Text>
                <Text className="font-text text-body-sm text-ink-2">
                  {typeof home.rangeChangeUsd === 'number'
                    ? `${formatSignedUsd(home.rangeChangeUsd)} · ${range}`
                    : range}
                </Text>
              </View>
              <HomeAttributionBreakdown summary={home.attribution} />
            </Tap>
          )}
        </View>

        <View className="mt-5">
          <View className="flex-row items-center justify-between">
            <SectionHeader title={t('home.balanceTrend')} />
            <SegmentedControl
              accessibilityLabel={t('common.chartRange')}
              options={HOME_RANGE_OPTIONS.map((option) => ({
                value: option,
                label: option,
                accessibilityLabel: option,
              }))}
              value={range}
              onChange={setRange}
            />
          </View>
          <View className="mt-3 h-[88px] justify-center">
            {showPortfolioImportState ? null : trend.isLoading ? (
              <SkeletonBlock className="h-[70px] w-full rounded-panel" />
            ) : (
              <PortfolioTrendChart
                trendPoints={home.trendPoints}
                height={82}
                gradientId="homeNetWorthSpark"
              />
            )}
          </View>
        </View>

        {isDemo ? (
          <DemoConnectOverlay
            onConnect={connect}
            isConnecting={account.isConnecting}
            error={account.connectionError}
          />
        ) : account.isUserResolutionFailed ? (
          <AccountUnavailableOverlay
            onRetry={() => void account.retryUserResolution()}
            isRetrying={account.loadingUser}
          />
        ) : null}
      </View>

      {account.isOwnBundle || account.viewingUserId ? (
        <HomeActionRow
          isDemo={isDemo}
          isStrategyActionRequired={isStrategyActionRequired}
          disabled={account.viewingUserId !== null && !account.isOwnBundle}
        />
      ) : null}

      <View className="mt-6">
        <StrategyStatusCard
          status={strategyStatus}
          loading={!isDemo && strategy.isLoading}
          onPress={
            account.isOwnBundle
              ? () => router.push(STRATEGY_DECISION_FOCUS_HREF)
              : undefined
          }
        />
      </View>

      {account.isOwnBundle || account.viewingUserId ? (
        <View className="mt-6">
          <View className="mb-2 flex-row items-center justify-between">
            <SectionHeader title={t('home.walletAssets')} />
            <Text
              className={cn(
                'font-mono text-data uppercase tracking-[0.76px]',
                !isDemo && walletAssets.failedChains.length > 0
                  ? 'text-alert'
                  : 'text-ink-3',
              )}
            >
              {isDemo
                ? t('home.demo')
                : walletAssets.failedChains.length > 0
                  ? t('home.partial')
                  : t('home.live')}
            </Text>
          </View>
          <View className="relative">
            <Card className="p-[13px]">
              {!isDemo &&
              (walletAssets.isLoading || bundleWallets.isLoading) ? (
                <AssetListSkeleton />
              ) : !isDemo && (walletAssets.isError || bundleWallets.isError) ? (
                <EmptyState
                  icon={RefreshCw}
                  tone="alert"
                  title={t('home.assetsErrorTitle')}
                  body={t('home.assetsErrorBody')}
                  action={{
                    label: t('common.retry'),
                    accessibilityLabel: t('home.assetsRetryA11y'),
                    onPress: retryWalletAssets,
                  }}
                />
              ) : (
                <>
                  {!isDemo && walletAssets.failedChains.length > 0 ? (
                    <Callout
                      tone="caution"
                      className="mb-2"
                      body={t('home.assetsPartialBody')}
                      action={{
                        label: t('common.retry'),
                        accessibilityLabel: t('home.assetsRetryA11y'),
                        onPress: retryWalletAssets,
                      }}
                    />
                  ) : null}
                  {displayedAssets.length === 0 ? (
                    <EmptyState
                      icon={Wallet}
                      title={t('home.assetsEmptyTitle')}
                      body={t('home.assetsEmptyBody')}
                    />
                  ) : (
                    displayedAssets.map((asset, index) => (
                      <AssetRow
                        key={asset.symbol}
                        asset={asset}
                        divider={index < displayedAssets.length - 1}
                      />
                    ))
                  )}
                </>
              )}
              <View className="mt-2 flex-row items-center justify-between border-t border-rule px-1 pt-3">
                <Text className="font-mono text-data text-ink-3">
                  {t('home.assetsIdleAcross', { count: walletCount })}
                </Text>
                <Text className="font-mono-semibold text-data text-ink-2">
                  {typeof walletAssetsTotal === 'number'
                    ? formatUsd(walletAssetsTotal)
                    : '-'}
                </Text>
              </View>
            </Card>
            {isDemo ? <DemoBlurCover /> : null}
          </View>
        </View>
      ) : null}

      {!account.isDemo && !homeIncome.isError ? (
        <View className="mt-6">
          <HomeIncomeCard {...homeIncome} />
        </View>
      ) : null}
    </ScreenScrollView>
  );
}
