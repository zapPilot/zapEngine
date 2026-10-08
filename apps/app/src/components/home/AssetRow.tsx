import { tokens } from '@zapengine/design-tokens/tokens';
import { memo } from 'react';
import { Text, View } from 'react-native';

import { ChainIconStack } from '@/components/token/ChainIconStack';
import { TokenIcon } from '@/components/token/TokenIcon';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { DemoAsset } from '@/integration/portfolioTypes';
import { formatUsd } from '@/lib/format';

// Wallet assets change far less often than the ETL/account state around them,
// and `asset` comes straight out of the query cache, so the identity check
// actually holds here.
export const AssetRow = memo(function AssetRow({
  asset,
  divider,
}: {
  asset: DemoAsset;
  divider: boolean;
}) {
  const usdLabel =
    typeof asset.usdValue === 'number' ? formatUsd(asset.usdValue) : '-';

  return (
    <View
      accessible
      accessibilityLabel={`${asset.symbol}, ${asset.name}, ${asset.amountLabel}, ${usdLabel}`}
      className="flex-row items-center gap-[13px] px-1 py-[11px]"
      style={
        divider
          ? {
              borderBottomWidth: 1,
              borderBottomColor: tokens.mode.night['rule-2'],
            }
          : null
      }
    >
      <TokenIcon symbol={asset.symbol} alt={asset.symbol} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline gap-[7px]">
          <Text className="font-text-semibold text-body text-ink">
            {asset.symbol}
          </Text>
          <Text className="font-text text-caption text-ink-3">
            {asset.name}
          </Text>
        </View>
        <View className="mt-[7px] flex-row items-center gap-1.5">
          <ChainIconStack chains={asset.chains} />
          <Text className="font-text text-caption text-ink-2" numberOfLines={1}>
            {asset.amountLabel}
          </Text>
        </View>
      </View>
      <Text className="font-mono-semibold text-data text-ink">{usdLabel}</Text>
    </View>
  );
});

export function AssetListSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          className="flex-row items-center gap-[13px] px-1 py-[11px]"
        >
          <SkeletonBlock className="h-9 w-9 rounded-round" />
          <View className="flex-1">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="mt-[7px] h-4 w-36 rounded-round" />
          </View>
          <SkeletonBlock className="h-4 w-16" />
        </View>
      ))}
    </View>
  );
}
