import type { PrivySimulationAssetChange } from '@zapengine/types/api';
import { View } from 'react-native';

import {
  SimulationAssetAmountRow,
  SimulationAssetSubtitle,
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
        <SimulationAssetSubtitle>{change.token.name}</SimulationAssetSubtitle>
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
    <View className="overflow-hidden rounded-panel border border-rule bg-sheet">
      <SimulationAssetFlowSections
        outgoing={outgoing}
        incoming={incoming}
        renderItem={renderAssetRow}
      />
    </View>
  );
}
