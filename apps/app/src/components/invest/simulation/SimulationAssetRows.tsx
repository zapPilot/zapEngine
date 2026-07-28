import type { PrivySimulationAssetChange } from '@zapengine/types/api';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { compactTokenAmount } from '@/integration/simulationPreviewModel';

function TokenMark({ change }: { change: PrivySimulationAssetChange }) {
  const [imageFailed, setImageFailed] = useState(false);
  const logoUrl = change.token.logoUrl;

  return (
    <View className="h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-elevated">
      {logoUrl && !imageFailed ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: logoUrl }}
          style={{ width: 36, height: 36 }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text className="font-sans-bold text-[13px] text-ink">
          {change.token.symbol.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function AssetRow({ change }: { change: PrivySimulationAssetChange }) {
  const outgoing = change.direction === 'out';
  const sign = outgoing ? '−' : '+';

  return (
    <View className="flex-row items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
      <TokenMark change={change} />
      <View className="min-w-0 flex-1">
        <Text
          className="font-sans-semibold text-[13px] text-ink"
          numberOfLines={1}
        >
          {change.token.symbol}
        </Text>
        <Text className="mt-0.5 text-[11px] text-ink-faint" numberOfLines={1}>
          {change.token.name}
        </Text>
      </View>
      <Text
        className={
          outgoing
            ? 'max-w-[56%] font-mono-semibold text-[13px] text-error'
            : 'max-w-[56%] font-mono-semibold text-[13px] text-success'
        }
        numberOfLines={1}
      >
        {sign}
        {compactTokenAmount(change.rawAmount, change.token.decimals)}{' '}
        {change.token.symbol}
      </Text>
    </View>
  );
}

function FlowSide({
  label,
  direction,
  changes,
}: {
  label: string;
  direction: 'out' | 'in';
  changes: readonly PrivySimulationAssetChange[];
}) {
  const Icon = direction === 'out' ? ArrowUpRight : ArrowDownLeft;
  const iconColor = direction === 'out' ? '#ff6f61' : '#7ad88f';

  return (
    <View>
      <View className="flex-row items-center gap-2 px-4 pb-1 pt-4">
        <Icon size={14} color={iconColor} />
        <Text className="font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
          {label}
        </Text>
      </View>
      {changes.length > 0 ? (
        changes.map((change, index) => (
          <AssetRow
            key={`${direction}-${change.callIndex}-${change.token.address ?? change.token.symbol}-${index}`}
            change={change}
          />
        ))
      ) : (
        <Text className="px-4 py-3 text-[12px] text-ink-faint">
          No assets detected
        </Text>
      )}
    </View>
  );
}

export function SimulationAssetRows({
  outgoing,
  incoming,
}: {
  outgoing: readonly PrivySimulationAssetChange[];
  incoming: readonly PrivySimulationAssetChange[];
}) {
  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-surface">
      <FlowSide label="You send" direction="out" changes={outgoing} />
      <View className="mx-4 h-px bg-line" />
      <FlowSide label="You receive" direction="in" changes={incoming} />
    </View>
  );
}
