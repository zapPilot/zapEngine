import type { HyperliquidAgentSessionStatus } from '@zapengine/app-core/hooks/useHyperliquidAgentSession';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import {
  hyperCoreLegReviewRows,
  HYPERCORE_LEG_ACTION,
  HYPERCORE_LEG_NOT_SIMULATED,
  HYPERCORE_LEG_TITLE,
} from '@/integration/hyperCoreLegModel';
import { formatUsd6 } from '@/lib/format';
import type { HyperCoreLegPlan } from '@/screens/invest/useHyperCoreLegPlan';

/**
 * The HLP leg funded straight from HyperCore. It is a terminal appendix to the
 * reviewed queue, never an entry in it: there is no EVM batch to fingerprint,
 * expire, or risk-hash.
 */
export function HyperCoreLegReviewCard({
  leg,
  agentStatus,
  stepLabel,
}: {
  leg: HyperCoreLegPlan;
  agentStatus: HyperliquidAgentSessionStatus;
  stepLabel?: string;
}) {
  const rows = hyperCoreLegReviewRows({
    requestedUsd6: leg.requestedUsd6,
    spendableUsd6: leg.spendableUsd6,
    accountMode: leg.accountMode,
    lockupDays: leg.plan?.lockupDays ?? null,
    agentStatus,
  });
  return (
    <Card className="p-4">
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 font-sans-semibold text-[12.5px] text-ink">
          {stepLabel ? `${stepLabel} · ` : ''}
          {HYPERCORE_LEG_TITLE}
          {'\n'}
          {HYPERCORE_LEG_ACTION}
        </Text>
        <Text className="font-mono-semibold text-[11px] text-accent">
          {formatUsd6(leg.requestedUsd6)}
        </Text>
      </View>
      <Text className="mb-3 text-[10.5px] leading-4 text-ink-dim">
        {HYPERCORE_LEG_NOT_SIMULATED}
      </Text>
      {rows.map((row, index) => (
        <InfoRow
          key={row.label}
          label={row.label}
          value={row.value}
          divider={index < rows.length - 1}
        />
      ))}
      {leg.isError ? (
        <Text
          accessibilityRole="alert"
          className="mt-3 text-[11px] leading-4 text-error"
        >
          The Hyperliquid deposit could not be prepared, so this plan cannot be
          sent yet. Go back and try again.
        </Text>
      ) : null}
      {leg.shortfallUsd6 !== null && leg.shortfallUsd6 > 0n ? (
        <Text
          accessibilityRole="alert"
          className="mt-3 text-[11px] leading-4 text-error"
        >
          Your spendable Hyperliquid balance no longer covers this deposit —
          short by {formatUsd6(leg.shortfallUsd6)}. Go back and lower the
          amount.
        </Text>
      ) : null}
    </Card>
  );
}
