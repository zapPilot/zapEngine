import type { EtlJobPollingState } from '@zapengine/app-core/hooks/wallet';
import { useEtlJobPolling } from '@zapengine/app-core/hooks/wallet';
import { tokens } from '@zapengine/design-tokens/tokens';
import { useRouter } from 'expo-router';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  MoreHorizontal,
  PieChart,
  RefreshCw,
  Wallet,
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
import { ZapStrategyCard } from '@/components/strategy/ZapStrategyCard';
import { ChainIconStack } from '@/components/token/ChainIconStack';
import { TokenIcon } from '@/components/token/TokenIcon';
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
import type { DemoAsset } from '@/data/demo';

import { useAccount } from '@/integration/useAccount';
import {
  DEFAULT_HOME_RANGE,
  HOME_RANGE_OPTIONS,
  type HomeRange,
  useHomeData,
} from '@/integration/useHomeData';
import { createStrategyStartAction } from '@/integration/strategyStartAction';
import { formatSignedPct, formatSignedUsd, formatUsd } from '@/lib/format';
import { formatSnapshotDate, isSnapshotToday } from '@/lib/portfolioDates';
import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import type { TranslationKey } from '@/i18n/translations';

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
  return (
    <View
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
      <View className="items-end">
        <Text className="font-mono-semibold text-[13.5px] text-ink">
          {typeof asset.usdValue === 'number' ? formatUsd(asset.usdValue) : '-'}
        </Text>
        <Text className="mt-[7px] font-mono text-[11px] text-ink-faint">
          Wallet
        </Text>
      </View>
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
          <View className="items-end">
            <SkeletonBlock className="h-4 w-16" />
            <SkeletonBlock className="mt-[7px] h-3 w-12" />
          </View>
        </View>
      ))}
    </View>
  );
}

function PartialWalletWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="mb-2 flex-row items-center gap-2 rounded-xl bg-[rgba(239,146,146,.07)] px-3 py-2.5">
      <Text className="min-w-0 flex-1 text-[11px] leading-[16px] text-[#ef9292]">
        Some network balances could not be loaded. The assets below are partial.
      </Text>
      <Tap
        accessibilityLabel="Retry unavailable network balances"
        accessibilityRole="button"
        className="min-h-9 justify-center px-1"
        hitSlop={8}
        onPress={onRetry}
      >
        <Text className="font-sans-semibold text-[10.5px] text-accent">
          Retry
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
}: {
  icon: ReactNode;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Tap
      className="flex-1 items-center gap-2 rounded-[15px] border border-line bg-[rgba(255,255,255,.035)] py-3"
      onPress={onPress}
    >
      {icon}
      <Text className="font-sans-semibold text-[12px] text-ink">{label}</Text>
    </Tap>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const { languageCode, t } = useContentLanguage();
  const authAction = useAuthenticatedAction();
  const [range, setRange] = useState<HomeRange>(DEFAULT_HOME_RANGE);
  const account = useAccount();
  const {
    state: etlState,
    startPolling: startEtlPolling,
    triggerEtl,
  } = useEtlJobPolling();
  const { data, isLoading, snapshotAvailability, walletAssets } = useHomeData(
    account.viewingUserId,
    account.address,
    range,
    {
      isResolvingSubject: account.isResolvingViewingUser,
      isEtlInProgress: account.isOwnBundle && etlState.isInProgress,
    },
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
  const { home, strategy } = data;
  const showBalanceSkeleton = !isDemo && isLoading && !etlState.isInProgress;
  const showPortfolioImportState =
    account.isOwnBundle &&
    !isDemo &&
    !showBalanceSkeleton &&
    snapshotAvailability === 'unavailable';
  const portfolioImportCopy = getPortfolioImportCopy(etlState.status);
  const retryPortfolioImport = () => {
    if (account.userId && account.address) {
      void triggerEtl(account.userId, account.address);
    }
  };
  const showAssetSkeleton = !isDemo && walletAssets.isLoading;
  const startStrategy = createStrategyStartAction(authAction.run, () =>
    router.push('/invest/amount'),
  );
  const connect = () => void account.connect().catch(() => undefined);
  const retryWalletAssets = () => void walletAssets.refetch();
  const latestSnapshotLabel = isSnapshotToday(home.latestSnapshotDate)
    ? t('home.today')
    : formatSnapshotDate(home.latestSnapshotDate, languageCode);

  return (
    <ScreenScrollView>
      <AppHeader action={<SharePortfolioButton />} />

      <View className="relative">
        <View className="px-5 pt-6">
          <SectionLabel>{t('home.netWorth')}</SectionLabel>
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
                <Text className="rounded-full bg-success/[0.12] px-[9px] py-[3px] font-sans-semibold text-[12.5px] text-success">
                  {typeof home.latestChangePct === 'number'
                    ? formatSignedPct(home.latestChangePct).replace('+', '')
                    : '-'}
                </Text>
                <Text className="text-[13px] text-ink-dim">
                  {typeof home.latestChangeUsd === 'number'
                    ? [
                        formatSignedUsd(home.latestChangeUsd),
                        latestSnapshotLabel,
                      ]
                        .filter(Boolean)
                        .join(' ')
                    : (latestSnapshotLabel ?? '')}
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
            label={t('home.invest')}
            onPress={() => router.push('/invest/amount')}
            icon={
              <ArrowDown
                size={18}
                color={tokens.color.accent}
                strokeWidth={1.8}
              />
            }
          />
          <ActionButton
            label={t('home.send')}
            onPress={() => router.push('/send')}
            icon={
              <ArrowUp
                size={18}
                color={tokens.color.accent}
                strokeWidth={1.8}
              />
            }
          />
          <ActionButton
            label={t('home.more')}
            icon={
              <MoreHorizontal
                size={18}
                color={tokens.color.accent}
                strokeWidth={1.8}
              />
            }
          />
        </View>
      ) : null}

      <View className="mt-6 px-5">
        <ZapStrategyCard
          strategy={strategy}
          onStart={startStrategy}
          availableToInvest={{
            wallet: walletAssets,
            isConnected: account.isConnected,
          }}
        />
      </View>

      <View className="mt-6 px-5">
        <Tap
          accessibilityRole="button"
          className="flex-row items-center gap-[13px] rounded-[15px] border border-line bg-[rgba(255,255,255,.035)] p-4"
          onPress={() => router.push('/portfolio')}
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl border border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.12)]">
            <PieChart size={18} strokeWidth={1.8} color={tokens.color.accent} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-sans-semibold text-[14.5px] text-ink">
              {t('home.portfolio')}
            </Text>
            <Text className="mt-1 text-[12px] text-ink-dim">
              {t('home.portfolioDescription')}
            </Text>
          </View>
          <ChevronRight size={18} strokeWidth={1.8} color="#71717a" />
        </Tap>
      </View>

      {account.isOwnBundle ? (
        <View className="mt-6 px-5">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="font-sans-semibold text-[15px] text-ink">
              {t('home.walletAssets')}
            </Text>
            <Text className="font-mono text-[9.5px] uppercase tracking-[0.76px] text-ink-faint">
              {isDemo
                ? t('home.demo')
                : walletAssets.failedChains.length > 0
                  ? t('home.partial')
                  : t('home.live')}
            </Text>
          </View>
          <View className="relative">
            <Card className="p-[13px]">
              {showAssetSkeleton ? (
                <AssetListSkeleton />
              ) : walletAssets.isError ? (
                <EmptyState
                  icon={
                    <RefreshCw size={17} strokeWidth={1.8} color="#ef9292" />
                  }
                  tone="error"
                  title="Wallet balance unavailable"
                  body="We could not load this wallet’s live balances."
                  action={{
                    label: 'Try again',
                    accessibilityLabel: 'Retry wallet balances',
                    onPress: retryWalletAssets,
                  }}
                />
              ) : (
                <>
                  {walletAssets.failedChains.length > 0 ? (
                    <PartialWalletWarning onRetry={retryWalletAssets} />
                  ) : null}
                  {home.assets.length === 0 ? (
                    <EmptyState
                      icon={
                        <Wallet
                          size={17}
                          strokeWidth={1.8}
                          color={tokens.color.accent}
                        />
                      }
                      title="No supported assets found"
                      body="USDC, USDT and ETH on Ethereum, Base or Arbitrum will appear here."
                    />
                  ) : (
                    home.assets.map((asset, index) => (
                      <AssetRow
                        key={asset.symbol}
                        asset={asset}
                        divider={index < home.assets.length - 1}
                      />
                    ))
                  )}
                </>
              )}
            </Card>
            {isDemo ? <DemoBlurCover /> : null}
          </View>
        </View>
      ) : null}
    </ScreenScrollView>
  );
}
