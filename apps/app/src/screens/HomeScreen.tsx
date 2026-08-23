import type { EtlJobPollingState } from '@zapengine/app-core/hooks/wallet';
import { useEtlJobPolling } from '@zapengine/app-core/hooks/wallet';
import { tokens } from '@zapengine/design-tokens/tokens';
import { useRouter } from 'expo-router';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  RefreshCw,
  Scale,
  TriangleAlert,
  Wallet,
  Zap,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { PortfolioTrendChart } from '@/components/charts/PortfolioTrendChart';
import {
  AccountUnavailableOverlay,
  DemoBlurCover,
  DemoConnectOverlay,
} from '@/components/home/DemoConnectOverlay';
import { HomeIncomeCard } from '@/components/home/HomeIncomeCard';
import { SharePortfolioButton } from '@/components/share/SharePortfolioButton';
import { ChainIconStack } from '@/components/token/ChainIconStack';
import { TokenIcon } from '@/components/token/TokenIcon';
import { AppHeader } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { DisplayUsdValue } from '@/components/ui/DisplayUsdValue';
import { EmptyState } from '@/components/ui/EmptyState';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { DEMO, type DemoAsset } from '@/data/demo';
import type { TranslationKey } from '@/i18n/translations';
import { useAccount } from '@/integration/useAccount';
import {
  DEFAULT_HOME_RANGE,
  HOME_RANGE_OPTIONS,
  type HomeRange,
  type HomeStrategyStatusView,
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

type PortfolioImportCopyKey = 'failed' | 'completed' | 'preparing';

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
} as const satisfies Record<
  PortfolioImportCopyKey,
  { titleKey: TranslationKey; bodyKey: TranslationKey; retryable: boolean }
>;

function getPortfolioImportCopy(status: EtlJobPollingState['status']) {
  if (status === 'failed') return PORTFOLIO_IMPORT_COPY.failed;
  if (status === 'completed') return PORTFOLIO_IMPORT_COPY.completed;
  return PORTFOLIO_IMPORT_COPY.preparing;
}

function AssetRow({ asset, divider }: { asset: DemoAsset; divider: boolean }) {
  const usdLabel =
    typeof asset.usdValue === 'number' ? formatUsd(asset.usdValue) : '-';

  return (
    <View
      accessible
      accessibilityLabel={`${asset.symbol}, ${asset.name}, ${asset.amountLabel}, ${usdLabel}`}
      className="flex-row items-center gap-[13px] px-1 py-[11px]"
      style={
        divider
          ? { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.05)' }
          : null
      }
    >
      <TokenIcon symbol={asset.symbol} alt={asset.symbol} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline gap-[7px]">
          <Text className="font-sans-semibold text-[14.5px] text-ink">
            {asset.symbol}
          </Text>
          <Text className="text-[12px] text-ink-faint">{asset.name}</Text>
        </View>
        <View className="mt-[7px] flex-row items-center gap-1.5">
          <ChainIconStack chains={asset.chains} />
          <Text className="text-[12px] text-ink-dim" numberOfLines={1}>
            {asset.amountLabel}
          </Text>
        </View>
      </View>
      <Text className="font-mono-semibold text-[13.5px] text-ink">
        {usdLabel}
      </Text>
    </View>
  );
}

function AssetListSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          className="flex-row items-center gap-[13px] px-1 py-[11px]"
        >
          <SkeletonBlock className="h-9 w-9 rounded-full" />
          <View className="flex-1">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="mt-[7px] h-4 w-36 rounded-full" />
          </View>
          <SkeletonBlock className="h-4 w-16" />
        </View>
      ))}
    </View>
  );
}

function PartialWalletWarning({ onRetry }: { onRetry: () => void }) {
  const { t } = useContentLanguage();

  return (
    <View className="mb-2 flex-row items-center gap-2 rounded-xl bg-[rgba(239,146,146,.07)] px-3 py-2.5">
      <Text className="min-w-0 flex-1 text-[11px] leading-[16px] text-[#ef9292]">
        {t('home.assetsPartialBody')}
      </Text>
      <Tap
        accessibilityLabel={t('home.assetsRetryA11y')}
        accessibilityRole="button"
        className="min-h-9 justify-center px-1"
        hitSlop={8}
        onPress={onRetry}
      >
        <Text className="font-sans-semibold text-[10.5px] text-accent">
          {t('common.retry')}
        </Text>
      </Tap>
    </View>
  );
}

function PortfolioImportState({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: string;
  body: string;
  retryLabel?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <View className="items-center justify-center rounded-2xl border border-line bg-[rgba(255,255,255,.025)] px-5 py-5">
      <Text className="text-center font-sans-semibold text-[14px] text-ink">
        {title}
      </Text>
      <Text className="mt-1.5 max-w-[310px] text-center text-[11.5px] leading-[17px] text-ink-dim">
        {body}
      </Text>
      {retryLabel && onRetry ? (
        <Tap
          accessibilityLabel={retryLabel}
          accessibilityRole="button"
          className="mt-3 flex-row items-center gap-1.5 rounded-full border border-[rgba(212,197,163,.22)] bg-[rgba(212,197,163,.07)] px-3 py-1.5"
          onPress={onRetry}
        >
          <RefreshCw size={12} strokeWidth={2} color={tokens.color.accent} />
          <Text className="font-sans-semibold text-[11px] text-accent">
            {retryLabel}
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  primary = false,
  accessibilityLabel,
  showIndicator = false,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  primary?: boolean;
  accessibilityLabel?: string | undefined;
  showIndicator?: boolean;
}) {
  return (
    <Tap
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-[15px] border py-3 ${
        primary
          ? 'border-[rgba(212,197,163,.28)] bg-[rgba(212,197,163,.12)]'
          : 'border-line bg-[rgba(255,255,255,.035)]'
      }`}
      onPress={onPress}
    >
      {icon}
      <Text
        numberOfLines={1}
        className={`font-sans-semibold text-[12.5px] ${primary ? 'text-accent' : 'text-ink'}`}
      >
        {label}
      </Text>
      <View
        accessible={false}
        className="absolute right-2 h-1.5 w-1.5 rounded-full bg-accent"
        style={{ opacity: showIndicator ? 1 : 0 }}
      />
    </Tap>
  );
}

function StrategyStatusCard({
  status,
  loading,
  onPress,
}: {
  status: HomeStrategyStatusView | null;
  loading: boolean;
  onPress: () => void;
}) {
  const { t } = useContentLanguage();

  if (loading && !status) {
    return (
      <View>
        <SectionLabel>{t('home.strategyStatusTitle')}</SectionLabel>
        <Card className="mt-3 p-4">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="mt-3 h-4 w-64" />
          <SkeletonBlock className="mt-2 h-4 w-40" />
        </Card>
      </View>
    );
  }

  if (!status) return null;

  const isActionRequired = status.status === 'action_required';
  const isBlocked = status.status === 'blocked';
  const title = isActionRequired
    ? t('home.rebalanceRecommended')
    : isBlocked
      ? t('home.strategyBlocked')
      : t('home.portfolioOnTarget');
  const icon = isActionRequired ? (
    <Zap size={16} strokeWidth={2} color={tokens.color.accent} />
  ) : isBlocked ? (
    <TriangleAlert size={16} strokeWidth={2} color={tokens.color.error} />
  ) : (
    <Check size={16} strokeWidth={2} color={tokens.color.success} />
  );

  return (
    <View>
      <SectionLabel>{t('home.strategyStatusTitle')}</SectionLabel>
      <Tap accessibilityRole="button" onPress={onPress} className="mt-3">
        <Card className="p-4" style={{ borderColor: 'rgba(212,197,163,.2)' }}>
          <View className="flex-row items-center gap-2">
            {icon}
            <Text className="flex-1 font-sans-semibold text-[15px] text-ink">
              {title}
            </Text>
            <ArrowRight
              size={16}
              strokeWidth={1.8}
              color={tokens.color['ink-faint']}
            />
          </View>

          <View className="mt-3 flex-row items-center gap-2">
            <Text className="font-mono text-[10px] uppercase tracking-[0.7px] text-ink-faint">
              {status.regimeLabel}
            </Text>
            {typeof status.fearGreed === 'number' ? (
              <>
                <Text className="text-[10px] text-ink-faint">·</Text>
                <Text className="font-mono text-[10px] text-ink-dim">
                  FGI {Math.round(status.fearGreed)}
                </Text>
              </>
            ) : null}
          </View>

          {status.primaryAction ? (
            <View className="mt-2.5">
              <Text className="text-[12.5px] leading-[18px] text-ink-dim">
                {status.primaryAction.description}
                {' · '}
                <Text className="font-mono-semibold text-ink">
                  {formatUsd(status.primaryAction.amountUsd)}
                </Text>
              </Text>
              {status.additionalActionCount > 0 ? (
                <Text className="mt-1 text-[10.5px] text-ink-faint">
                  {t('home.moreStrategyActions', {
                    count: status.additionalActionCount,
                  })}
                </Text>
              ) : null}
            </View>
          ) : status.reason ? (
            <Text className="mt-2.5 text-[12px] leading-[18px] text-ink-dim">
              {status.reason}
            </Text>
          ) : null}

          <Text className="mt-3 font-sans-semibold text-[11px] text-accent">
            {isActionRequired
              ? t('home.viewRecommendation')
              : t('home.viewStrategy')}
          </Text>
        </Card>
      </Tap>
    </View>
  );
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
  const { data, isLoading, snapshotAvailability } = useHomeData(
    account.viewingUserId,
    range,
    {
      isResolvingSubject: account.isResolvingViewingUser,
      isEtlInProgress: account.isOwnBundle && etlState.isInProgress,
    },
  );
  const homeIncome = useHomeIncome(account.viewingUserId);
  const walletAssets = useWalletAssets(
    account.isOwnBundle ? account.walletAddresses : [],
  );

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
  const showBalanceSkeleton = !isDemo && isLoading && !etlState.isInProgress;
  const showPortfolioImportState =
    account.isOwnBundle &&
    !isDemo &&
    !showBalanceSkeleton &&
    snapshotAvailability === 'unavailable';
  const portfolioImportCopy = getPortfolioImportCopy(etlState.status);
  const portfolioNeedsVerification = etlState.errorMessage?.includes(
    'ownership has not been verified',
  );
  const retryPortfolioImport = () => {
    if (account.userId && account.address) {
      void triggerEtl(account.userId, account.address);
    }
  };
  const connect = () => void account.connect().catch(() => undefined);
  const retryWalletAssets = () => void walletAssets.refetch();
  const displayedAssets = isDemo ? DEMO.home.assets : walletAssets.assets;
  const walletCount = normalizeWalletAddressList(
    account.isOwnBundle ? account.walletAddresses : [],
  ).length;
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
            {!showPortfolioImportState ? (
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
            ) : null}
          </View>

          {showPortfolioImportState ? (
            <View className="mt-3">
              <PortfolioImportState
                title={
                  portfolioNeedsVerification
                    ? 'Verify this wallet first'
                    : t(portfolioImportCopy.titleKey)
                }
                body={
                  portfolioNeedsVerification
                    ? 'Go to Wallets, switch to this wallet, and verify ownership before importing its portfolio.'
                    : t(portfolioImportCopy.bodyKey)
                }
                retryLabel={
                  portfolioImportCopy.retryable && !portfolioNeedsVerification
                    ? t('common.retry')
                    : undefined
                }
                onRetry={
                  portfolioImportCopy.retryable && !portfolioNeedsVerification
                    ? retryPortfolioImport
                    : undefined
                }
              />
            </View>
          ) : (
            <>
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
            </>
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
            {showPortfolioImportState ? null : showBalanceSkeleton ? (
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
          <ActionButton
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
          <ActionButton
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
          <ActionButton
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
          loading={!isDemo && isLoading}
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
