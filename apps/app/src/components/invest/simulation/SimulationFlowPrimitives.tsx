import type {
  PrivySimulationAssetChange,
  PrivySimulationToken,
} from '@zapengine/types/api';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { TokenIcon } from '@/components/token/TokenIcon';
import { compactTokenAmount } from '@/integration/simulationPreviewModel';

/**
 * Shared row icon. Simulation payloads name arbitrary tokens, including GM
 * market tokens with no committed mark, so this delegates the whole
 * committed-mark / remote-logo / initial chain to `TokenIcon`.
 */
export function SimulationTokenMark({
  token,
}: {
  token: PrivySimulationToken;
}) {
  return (
    <TokenIcon
      symbol={token.symbol}
      size={36}
      {...(token.logoUrl && { remoteLogoUrl: token.logoUrl })}
    />
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
function SimulationDirectionalSection<T>({
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

/**
 * The send/receive pair both flow containers end with. Only the row content
 * differs between the legacy Privy preview and the unified route review, so
 * callers own `renderItem` and nothing else.
 */
export function SimulationAssetFlowSections({
  outgoing,
  incoming,
  renderItem,
}: {
  outgoing: readonly PrivySimulationAssetChange[];
  incoming: readonly PrivySimulationAssetChange[];
  renderItem: (change: PrivySimulationAssetChange, index: number) => ReactNode;
}) {
  return (
    <>
      <SimulationDirectionalSection
        label="You send"
        direction="out"
        items={outgoing}
        renderItem={renderItem}
      />
      <View className="mx-4 h-px bg-line" />
      <SimulationDirectionalSection
        label="You receive"
        direction="in"
        items={incoming}
        renderItem={renderItem}
      />
    </>
  );
}
