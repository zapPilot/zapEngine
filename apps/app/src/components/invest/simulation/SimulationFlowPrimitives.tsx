import type { PrivySimulationToken } from '@zapengine/types/api';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { compactTokenAmount } from '@/integration/simulationPreviewModel';

/** Shared row icon: the token logo when available, else its initial letter. */
export function SimulationTokenMark({
  token,
}: {
  token: PrivySimulationToken;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const logoUrl = token.logoUrl;

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
          {token.symbol.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/** Shared uppercase icon+label header for one flow section (approve/send/receive). */
export function SimulationFlowSectionHeader({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2 px-4 pb-1 pt-4">
      {children}
      <Text className="font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
        {label}
      </Text>
    </View>
  );
}

/** Shared token-icon + symbol + signed-amount row shell; callers own the subtitle line. */
export function SimulationAssetAmountRow({
  token,
  subtitle,
  direction,
  rawAmount,
  amountMaxWidthClassName = 'max-w-[56%]',
}: {
  token: PrivySimulationToken;
  subtitle: ReactNode;
  direction: 'out' | 'in';
  rawAmount: string;
  amountMaxWidthClassName?: string;
}) {
  const outgoing = direction === 'out';

  return (
    <View className="flex-row items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
      <SimulationTokenMark token={token} />
      <View className="min-w-0 flex-1">
        <Text
          className="font-sans-semibold text-[13px] text-ink"
          numberOfLines={1}
        >
          {token.symbol}
        </Text>
        {subtitle}
      </View>
      <Text
        className={`${amountMaxWidthClassName} font-mono-semibold text-[13px] ${
          outgoing ? 'text-error' : 'text-success'
        }`}
        numberOfLines={1}
      >
        {outgoing ? '−' : '+'}
        {compactTokenAmount(rawAmount, token.decimals)} {token.symbol}
      </Text>
    </View>
  );
}

/**
 * Shared "You send" / "You receive" style section: a direction-colored
 * header over either the rendered items or an empty-state message. Callers
 * own how each item renders (they may need extra props, like `contracts`).
 */
export function SimulationDirectionalSection<T>({
  label,
  direction,
  items,
  renderItem,
  emptyLabel = 'No assets detected',
}: {
  label: string;
  direction: 'out' | 'in';
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  emptyLabel?: string;
}) {
  const Icon = direction === 'out' ? ArrowUpRight : ArrowDownLeft;
  const iconColor = direction === 'out' ? '#ff6f61' : '#7ad88f';

  return (
    <View>
      <SimulationFlowSectionHeader label={label}>
        <Icon size={14} color={iconColor} />
      </SimulationFlowSectionHeader>
      {items.length > 0 ? (
        items.map(renderItem)
      ) : (
        <Text className="px-4 py-3 text-[12px] text-ink-faint">
          {emptyLabel}
        </Text>
      )}
    </View>
  );
}
