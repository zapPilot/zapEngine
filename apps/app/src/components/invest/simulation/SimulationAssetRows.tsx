import type { PrivySimulationAssetChange } from '@zapengine/types/api';
import { Text, View } from 'react-native';

import {
  SimulationAssetAmountRow,
  SimulationDirectionalSection,
} from '@/components/invest/simulation/SimulationFlowPrimitives';

// jscpd:ignore-start -- this wiring around the shared SimulationAssetAmountRow
// / SimulationDirectionalSection primitives is intentionally the same shape as
// SimulationFlowRows.tsx's AssetRow/AssetSection: this file is the legacy
// Privy preview's row (no counterparty, no call-index), while the other is the
// unified route review's row (counterparty + call-index). Merging them would
// force one screen's content shape onto the other.
function AssetRow({ change }: { change: PrivySimulationAssetChange }) {
  return (
    <SimulationAssetAmountRow
      token={change.token}
      subtitle={
        <Text className="mt-0.5 text-[11px] text-ink-faint" numberOfLines={1}>
          {change.token.name}
        </Text>
      }
      direction={change.direction}
      rawAmount={change.rawAmount}
    />
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
  return (
    <SimulationDirectionalSection
      label={label}
      direction={direction}
      items={changes}
      renderItem={(change, index) => (
        <AssetRow
          key={`${direction}-${change.callIndex}-${change.token.address ?? change.token.symbol}-${index}`}
          change={change}
        />
      )}
    />
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
// jscpd:ignore-end
