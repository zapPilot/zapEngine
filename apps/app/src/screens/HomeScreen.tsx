import { useRouter } from 'expo-router';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  MoreHorizontal,
  PieChart,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Sparkline } from '@/components/charts/Sparkline';
import { ZapStrategyCard } from '@/components/strategy/ZapStrategyCard';
import { ChainIconStack } from '@/components/token/ChainIconStack';
import { TokenIcon } from '@/components/token/TokenIcon';
import { AppHeader } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { DEMO } from '@/data/demo';
import { DisplayUsdValue } from '@/components/ui/DisplayUsdValue';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { useAccount } from '@/integration/useAccount';
import {
  DEFAULT_HOME_RANGE,
  type HomeRange,
  useHomeData,
} from '@/integration/useHomeData';
import { createStrategyStartAction } from '@/integration/strategyStartAction';
import { formatSignedPct, formatSignedUsd, formatUsd } from '@/lib/format';
import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';

const RANGE_OPTIONS = ['1D', '1W', '1M', '1Y', 'ALL'] as const;

type HomeAsset = (typeof DEMO)['home']['assets'][number];

function AssetRow({ asset, divider }: { asset: HomeAsset; divider: boolean }) {
  return (
    <View
      className="flex-row items-center gap-[13px] px-1 py-[11px]"
      style={
        divider
          ? { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.05)' }
          : null
      }
    >
      <TokenIcon glyph={asset.glyph} bg={asset.iconBg} alt={asset.symbol} />
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
  const authAction = useAuthenticatedAction();
  const [range, setRange] = useState<HomeRange>(DEFAULT_HOME_RANGE);
  const account = useAccount();
  const { data, isLoading, walletAssets } = useHomeData(
    account.userId,
    account.address,
    range,
    account.walletAddresses,
  );

  const isDemo = !account.isConnected;
  const home = data?.home ?? DEMO.home;
  const strategy = data?.strategy ?? DEMO.strategy;
  const showBalanceSkeleton = !isDemo && isLoading && data === null;
  const showAssetSkeleton = !isDemo && walletAssets.isLoading;
  const changePct = home.changePct;
  const changeUsd = home.changeUsdToday;
  const startStrategy = createStrategyStartAction(authAction.run, () =>
    router.push('/invest/amount'),
  );

  return (
    <ScreenScrollView>
      <AppHeader />

      <View className="px-5 pt-6">
        <SectionLabel>Net worth</SectionLabel>
        <DisplayUsdValue
          loading={showBalanceSkeleton}
          value={home.totalBalance}
          valueClassName="mt-2 font-serif text-[54px] leading-[58px] text-ink"
          fractionClassName="text-[34px] text-ink-faint"
          skeletonClassName="mt-2 h-[58px] w-[230px] rounded-xl"
          emptyClassName="text-ink-faint"
        />
        <View className="mt-[9px] flex-row items-center gap-2">
          <Text className="rounded-full bg-[rgba(122,216,143,.12)] px-[9px] py-[3px] font-sans-semibold text-[12.5px] text-success">
            {typeof changePct === 'number'
              ? formatSignedPct(changePct).replace('+', '')
              : '-'}
          </Text>
          <Text className="text-[13px] text-ink-dim">
            {typeof changeUsd === 'number'
              ? `${formatSignedUsd(changeUsd)} today`
              : 'today'}
          </Text>
        </View>
      </View>

      <View className="mt-5 px-5">
        <View className="flex-row items-center justify-between">
          <SectionLabel>Balance trend</SectionLabel>
          <RangeTabs
            options={RANGE_OPTIONS}
            value={range}
            onChange={(value) => setRange(value as HomeRange)}
          />
        </View>
        <View className="mt-3 h-[88px] justify-center">
          {showBalanceSkeleton ? (
            <SkeletonBlock className="h-[70px] w-full rounded-2xl" />
          ) : (
            <Sparkline data={home.sparkline} height={82} />
          )}
        </View>
      </View>

      <View className="mt-5 flex-row gap-3 px-5">
        <ActionButton
          label="Invest"
          onPress={() => router.push('/invest/amount')}
          icon={<ArrowDown size={18} color="#d4c5a3" strokeWidth={1.8} />}
        />
        <ActionButton
          label="Send"
          onPress={() => router.push('/send')}
          icon={<ArrowUp size={18} color="#d4c5a3" strokeWidth={1.8} />}
        />
        <ActionButton
          label="More"
          icon={<MoreHorizontal size={18} color="#d4c5a3" strokeWidth={1.8} />}
        />
      </View>

      <View className="mt-6 px-5">
        <ZapStrategyCard strategy={strategy} onStart={startStrategy} />
      </View>

      <View className="mt-6 px-5">
        <Tap
          accessibilityRole="button"
          className="flex-row items-center gap-[13px] rounded-[15px] border border-line bg-[rgba(255,255,255,.035)] p-4"
          onPress={() => router.push('/portfolio')}
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl border border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.12)]">
            <PieChart size={18} strokeWidth={1.8} color="#d4c5a3" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-sans-semibold text-[14.5px] text-ink">
              Portfolio
            </Text>
            <Text className="mt-1 text-[12px] text-ink-dim">
              Strategy position, metrics & allocation breakdown
            </Text>
          </View>
          <ChevronRight size={18} strokeWidth={1.8} color="#71717a" />
        </Tap>
      </View>

      <View className="mt-6 px-5">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="font-sans-semibold text-[15px] text-ink">
            Wallet assets
          </Text>
          <Text className="font-mono text-[9.5px] uppercase tracking-[0.76px] text-ink-faint">
            {isDemo ? 'Demo' : 'Live'}
          </Text>
        </View>
        <Card className="p-[13px]">
          {showAssetSkeleton ? (
            <AssetListSkeleton />
          ) : (
            home.assets.map((asset, index) => (
              <AssetRow
                key={asset.symbol}
                asset={asset}
                divider={index < home.assets.length - 1}
              />
            ))
          )}
        </Card>
      </View>
    </ScreenScrollView>
  );
}
