import type { PrivySimulationAssetChange } from '@zapengine/types/api';
import { Text, View } from 'react-native';

import {
  SimulationAssetAmountRow,
  SimulationAssetFlowSections,
} from '@/components/invest/simulation/SimulationFlowPrimitives';

/**
 * The legacy Privy preview's asset row: the payload carries no counterparty
 * and no call index here, so the subtitle is just the token name.
 */
function renderAssetRow(change: PrivySimulationAssetChange, index: number) {
  return (
    <SimulationAssetAmountRow
      key={`${change.direction}-${change.callIndex}-${change.token.address ?? change.token.symbol}-${index}`}
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

export function SimulationAssetRows({
  outgoing,
  incoming,
}: {
  outgoing: readonly PrivySimulationAssetChange[];
  incoming: readonly PrivySimulationAssetChange[];
}) {
  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-surface">
      <SimulationAssetFlowSections
        outgoing={outgoing}
        incoming={incoming}
        renderItem={renderAssetRow}
      />
    </View>
  );
}
