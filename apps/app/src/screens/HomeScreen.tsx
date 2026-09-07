import type { EtlJobPollingState } from '@zapengine/app-core/hooks/wallet';
import { useEtlJobPolling } from '@zapengine/app-core/hooks/wallet';
import { tokens } from '@zapengine/design-tokens/tokens';
import { useRouter } from 'expo-router';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  RefreshCw,
  Scale,
  Wallet,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { PortfolioTrendChart } from '@/components/charts/PortfolioTrendChart';
import { AssetListSkeleton, AssetRow } from '@/components/home/AssetRow';
import {
  AccountUnavailableOverlay,
  DemoBlurCover,
  DemoConnectOverlay,
} from '@/components/home/DemoConnectOverlay';
import { HomeActionButton } from '@/components/home/HomeActionButton';
import { HomeAttributionBreakdown } from '@/components/home/HomeAttributionBreakdown';
import { HomeIncomeCard } from '@/components/home/HomeIncomeCard';
import { PartialWalletWarning } from '@/components/home/PartialWalletWarning';
import { PortfolioImportState } from '@/components/home/PortfolioImportState';
import { StrategyStatusCard } from '@/components/home/StrategyStatusCard';
import { SharePortfolioButton } from '@/components/share/SharePortfolioButton';
import { AppHeader } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { DisplayUsdValue } from '@/components/ui/DisplayUsdValue';
import { EmptyState } from '@/components/ui/EmptyState';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { DEMO } from '@/data/demo';
import type { TranslationKey } from '@/i18n/translations';
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
  const ownWalletAddresses = normalizeWalletAddressList(
    account.isOwnBundle ? account.walletAddresses : [],
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
  const connect = () => void account.connect().catch(() => undefined);
  const retryWalletAssets = () => void walletAssets.refetch();
  const displayedAssets = isDemo ? DEMO.home.assets : walletAssets.assets;
  const walletCount = ownWalletAddresses.length;
  const walletAssetsTotal = isDemo
    ? displayedAssets.reduce((total, asset) => total + (asset.usdValue ?? 0), 0)
    : walletAssets.totalUsdValue;
  const isStrategyActionRequired = strategyStatus?.status === 'action_required';

  return (
    <ScreenScrollView>
      <AppHeader action={<SharePortfolioButton />} />

      <View className="relative">
        <View className="px-5 pt-6">
          <View className="flex-row items-center justify-between">
            <SectionLabel>{t('home.netWorth')}</SectionLabel>
            <Tap
              accessibilityRole="button"
              className="flex-row items-center gap-1 py-1"
              onPress={() => router.push('/portfolio')}
            >
              <Text className="font-sans-semibold text-[10.5px] text-accent">
                {t('home.viewPortfolio')}
              </Text>
              <ArrowRight
                size={12}
                strokeWidth={2}
                color={tokens.color.accent}
              />
            </Tap>
          </View>

          {showPortfolioImportState ? (
            <View className="mt-3">
              <PortfolioImportState
                title={t(portfolioImportCopy.titleKey)}
                body={t(portfolioImportCopy.bodyKey)}
                retryLabel={
                  portfolioImportCopy.retryable ? t('common.retry') : undefined
                }
                onRetry={
                  portfolioImportCopy.retryable
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
                loading={showBalanceSkeleton}
                value={home.totalBalance}
                valueClassName="mt-2 font-serif text-[54px] leading-[58px] text-ink"
                fractionClassName="text-[34px] text-ink-faint"
                skeletonClassName="mt-2 h-[58px] w-[230px] rounded-xl"
                emptyClassName="text-ink-faint"
              />
              <View className="mt-[9px] flex-row items-center gap-2">
                <Text
                  className={`rounded-full px-[9px] py-[3px] font-sans-semibold text-[12.5px] ${
                    typeof home.rangeChangePct === 'number' &&
                    home.rangeChangePct < 0
                      ? 'bg-error/[0.12] text-error'
                      : 'bg-success/[0.12] text-success'
                  }`}
                >
                  {typeof home.rangeChangePct === 'number'
                    ? formatSignedPct(home.rangeChangePct)
                    : '-'}
                </Text>
                <Text className="text-[13px] text-ink-dim">
                  {typeof home.rangeChangeUsd === 'number'
                    ? `${formatSignedUsd(home.rangeChangeUsd)} · ${range}`
                    : range}
                </Text>
              </View>
              <HomeAttributionBreakdown summary={home.attribution} />
            </Tap>
          )}
        </View>

        <View className="mt-5 px-5">
          <View className="flex-row items-center justify-between">
            <SectionLabel>{t('home.balanceTrend')}</SectionLabel>
            <RangeTabs
              options={HOME_RANGE_OPTIONS}
              value={range}
              onChange={setRange}
            />
          </View>
          <View className="mt-3 h-[88px] justify-center">
            {showPortfolioImportState ? null : trend.isLoading ? (
              <SkeletonBlock className="h-[70px] w-full rounded-2xl" />
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

      {account.isOwnBundle ? (
        <View className="mt-5 flex-row gap-3 px-5">
          <HomeActionButton
            primary={!isStrategyActionRequired}
            label={t('home.invest')}
            onPress={() => router.push('/invest/amount')}
            icon={
              <ArrowDown
                size={17}
                color={tokens.color.accent}
                strokeWidth={1.8}
              />
            }
          />
          <HomeActionButton
            accessibilityLabel={
              isStrategyActionRequired
                ? t('home.rebalanceActionRequiredA11y')
                : undefined
            }
            primary={isStrategyActionRequired}
            showIndicator={isStrategyActionRequired}
            label={t('home.rebalance')}
            onPress={() => router.push(STRATEGY_DECISION_FOCUS_HREF)}
            icon={
              <Scale size={17} color={tokens.color.accent} strokeWidth={1.8} />
            }
          />
          <HomeActionButton
            label={t('home.send')}
            onPress={() => router.push('/send')}
            icon={
              <ArrowUp
                size={17}
                color={tokens.color.accent}
                strokeWidth={1.8}
              />
            }
          />
        </View>
      ) : null}

      <View className="mt-6 px-5">
        <StrategyStatusCard
          status={strategyStatus}
          loading={!isDemo && strategy.isLoading}
          onPress={() => router.push(STRATEGY_DECISION_FOCUS_HREF)}
        />
      </View>

      {account.isOwnBundle ? (
        <View className="mt-6 px-5">
          <View className="mb-2 flex-row items-center justify-between">
            <SectionLabel>{t('home.walletAssets')}</SectionLabel>
            <Text
              className={`font-mono text-[9.5px] uppercase tracking-[0.76px] ${
                !isDemo && walletAssets.failedChains.length > 0
                  ? 'text-[#ef9292]'
                  : 'text-ink-faint'
              }`}
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
              {!isDemo && walletAssets.isLoading ? (
                <AssetListSkeleton />
              ) : !isDemo && walletAssets.isError ? (
                <EmptyState
                  icon={
                    <RefreshCw size={17} strokeWidth={1.8} color="#ef9292" />
                  }
                  tone="error"
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
                    <PartialWalletWarning onRetry={retryWalletAssets} />
                  ) : null}
                  {displayedAssets.length === 0 ? (
                    <EmptyState
                      icon={
                        <Wallet
                          size={17}
                          strokeWidth={1.8}
                          color={tokens.color.accent}
                        />
                      }
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
              <View className="mt-2 flex-row items-center justify-between border-t border-line px-1 pt-3">
                <Text className="font-mono text-[9.5px] text-ink-faint">
                  {t('home.assetsIdleAcross', { count: walletCount })}
                </Text>
                <Text className="font-mono-semibold text-[12.5px] text-ink-dim">
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
        <View className="mt-6 px-5">
          <HomeIncomeCard {...homeIncome} />
        </View>
      ) : null}
    </ScreenScrollView>
  );
}
