import { Icon } from '@/components/ui/Icon';
import { Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ChainTokenSelectorSheet } from '@/components/invest/ChainTokenSelectorSheet';
import { InvestLineItem } from '@/components/invest/InvestLineItem';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Disclosure } from '@/components/ui/Disclosure';
import { Tap } from '@/components/ui/Tap';
import {
  fundingPlanSummary,
  fundingWarningMessage,
  FUNDING_SOURCE_EXCLUDED,
  type FundingPlan,
  type FundingPreference,
  type FundingSourceChainId,
} from '@/integration/investFundingPlanner';
import type {
  FundingSourceRow,
  FundingSourceView,
} from '@/integration/investFundingSources';
import { formatUsd6 } from '@/lib/format';

/**
 * Deliberately free of route names and fee estimates: the ranking is a static
 * cost tier, not a quote, so anything money-shaped here would be invented.
 */
function sourceSubtitle(row: FundingSourceRow): string {
  if (row.status === 'unavailable') return 'Balance unavailable';
  if (row.balanceUsd6 === null) return 'Price unavailable';
  const parts = [`${formatUsd6(row.balanceUsd6)} balance`];
  if (row.status !== 'used') parts.push('Not used');
  if (row.excluded) parts.push('Turned off');
  else if (row.preferred) parts.push('Custom');
  return parts.join(' · ');
}

export function FundingPlanDisclosure({
  plan,
  sources,
  hasAmount,
  isConnected,
  hasPreferences,
  hyperCoreNote,
  onChangePreference,
  onUseRecommended,
}: {
  plan: FundingPlan;
  sources: FundingSourceView;
  hasAmount: boolean;
  isConnected: boolean;
  hasPreferences: boolean;
  /** Account-shape caveat about the Hyperliquid balance, when there is one. */
  hyperCoreNote: string | null;
  onChangePreference: (
    chainId: FundingSourceChainId,
    preference: FundingPreference | null,
  ) => void;
  onUseRecommended: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [picker, setPicker] = useState<FundingSourceChainId | null>(null);
  // Empty balances would triple the list without answering anything.
  const visible = sources.rows.filter((row) => row.status !== 'empty');
  // Rows are funded-first, so a chain's first visible row is the one it is
  // currently drawing on; only that row carries the chain's switch control.
  const isChainAnchor = (row: FundingSourceRow): boolean =>
    visible.find((other) => other.chainId === row.chainId) === row;
  const sourceControl = (row: FundingSourceRow) => {
    if (row.canExclude) {
      return (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={
            row.excluded ? `Use ${row.label}` : `Do not use ${row.label}`
          }
          onPress={() =>
            onChangePreference(
              row.chainId,
              row.excluded ? null : FUNDING_SOURCE_EXCLUDED,
            )
          }
        >
          <Text className="font-mono-medium mt-2 text-label text-ink">
            {row.excluded ? 'Use this balance' : "Don't use"}
          </Text>
        </Tap>
      );
    }
    if (!row.canChange || !isChainAnchor(row)) return undefined;
    return (
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`Change source for ${row.chainLabel}`}
        onPress={() => setPicker(row.chainId)}
      >
        <Text className="font-mono-medium mt-2 text-label text-ink">
          Change source
        </Text>
      </Tap>
    );
  };
  return (
    <View className="mt-4 rounded-panel border border-rule px-4">
      <Disclosure
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        accessibilityLabel="How we'll fund this"
        header={
          <>
            <Icon icon={Wallet} size="md" tone="secondary" />
            <View className="flex-1">
              <Text className="font-text text-caption text-ink">
                How we&apos;ll fund this
              </Text>
              <Text className="font-mono-medium mt-1 text-label text-ink-2">
                {fundingPlanSummary({
                  sourceCount: sources.usedSourceCount,
                  hasPreferences,
                  isConnected,
                })}
              </Text>
            </View>
          </>
        }
      >
        <Text className="font-mono-medium text-label uppercase text-ink-3">
          Sources
        </Text>
        {visible.map((row) => (
          <InvestLineItem
            key={row.key}
            icon={
              <TokenIcon
                symbol={row.symbol}
                chainKey={row.chainKey}
                size={28}
                alt=""
              />
            }
            title={row.label}
            subtitle={sourceSubtitle(row)}
            value={
              row.status === 'used' && hasAmount
                ? formatUsd6(row.usedUsd6)
                : '—'
            }
            valueTone={row.status === 'unavailable' ? 'error' : undefined}
            divider
            trailing={sourceControl(row)}
          />
        ))}
        <Text className="font-mono-medium my-2 text-label text-ink-2">
          We keep about $5 of ETH on each chain for gas.
        </Text>
        {plan.warnings
          .filter((w) => w.kind !== 'eth-reserve-applied')
          .map((w, index) => (
            <Text
              key={`${w.kind}:${index}`}
              className="font-mono-medium my-1 text-label text-ink-2"
            >
              {fundingWarningMessage(w)}
            </Text>
          ))}
        {hyperCoreNote ? (
          <Text className="font-mono-medium my-1 text-label text-ink-2">
            {hyperCoreNote}
          </Text>
        ) : null}
        <Text className="font-mono-medium my-2 text-label text-ink-2">
          {sources.usedChainCount} wallet batches — one signature per source
          chain.
        </Text>
        {hasPreferences ? (
          <Tap accessibilityRole="button" onPress={onUseRecommended}>
            <Text className="font-mono-medium py-2 text-label text-ink">
              Use recommended
            </Text>
          </Tap>
        ) : null}
      </Disclosure>
      {picker !== null ? (
        <ChainTokenSelectorSheet
          visible
          title="Change source"
          subtitle="Choose which balance funds this chain."
          rows={sources.rows.filter((row) => row.chainId === picker)}
          onSelect={(symbol) => onChangePreference(picker, symbol)}
          onClearPreference={() => onChangePreference(picker, null)}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </View>
  );
}
