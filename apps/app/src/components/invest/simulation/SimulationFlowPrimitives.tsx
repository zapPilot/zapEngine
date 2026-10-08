import { Icon as UiIcon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
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
      <Text className="font-mono-semibold text-data uppercase tracking-[.8px] text-ink-3">
        {label}
      </Text>
    </View>
  );
}

/** One-line secondary annotation shared by both simulation asset views. */
export function SimulationAssetSubtitle({ children }: { children: ReactNode }) {
  return (
    <Text
      className="font-mono-medium mt-0.5 text-label text-ink-3"
      numberOfLines={1}
    >
      {children}
    </Text>
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
    <View className="flex-row items-center gap-3 border-t border-rule px-4 py-3 first:border-t-0">
      <SimulationTokenMark token={token} />
      <View className="min-w-0 flex-1">
        <Text
          className="font-text-semibold text-body-sm text-ink"
          numberOfLines={1}
        >
          {token.symbol}
        </Text>
        {subtitle}
      </View>
      <Text
        className={cn(
          amountMaxWidthClassName,
          'font-mono-semibold text-data',
          outgoing ? 'text-alert' : 'text-ink',
        )}
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
  const iconTone = direction === 'out' ? 'down' : 'up';

  return (
    <View>
      <SimulationFlowSectionHeader label={label}>
        <UiIcon icon={Icon} size="xs" tone={iconTone} />
      </SimulationFlowSectionHeader>
      {items.length > 0 ? (
        items.map(renderItem)
      ) : (
        <Text className="font-text px-4 py-3 text-caption text-ink-3">
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
      <View className="mx-4 h-px bg-rule" />
      <SimulationDirectionalSection
        label="You receive"
        direction="in"
        items={incoming}
        renderItem={renderItem}
      />
    </>
  );
}
