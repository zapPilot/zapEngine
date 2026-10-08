import { tokens } from '@zapengine/design-tokens/tokens';
import type { DepositReviewGroup } from '@zapengine/types/api';
import { useState } from 'react';
import { View } from 'react-native';

import {
  SimulationCallRow,
  SimulationCollapseToggle,
} from '@/components/invest/simulation/SimulationCallList';
import {
  SimulationEvidenceStats,
  SimulationShareLinks,
} from '@/components/invest/simulation/SimulationReviewPrimitives';
import { TenderlyLogo } from '@/components/ui/TenderlyLogo';
import { simulationChainLabel } from '@/integration/simulationPreviewModel';

function evidenceStatus(review: DepositReviewGroup): {
  label: string;
  color: string;
} {
  if (review.status === 'failed') {
    return { label: 'Simulation failed', color: tokens.mode.night['alert'] };
  }
  if (review.status === 'unavailable') {
    return {
      label: 'Simulation unavailable',
      color: tokens.mode.night['ink-3'],
    };
  }
  return { label: 'Verified by Tenderly', color: tokens.mode.night['ink'] };
}

/**
 * A default-collapsed verification row for the unified route review: a
 * bundled Tenderly mark, chain, and call count. Expanding reveals the
 * ordered call list plus block number, call gas, and public simulation
 * links. Independent from the legacy Privy preview's own evidence block.
 */
export function SimulationTenderlyEvidence({
  review,
}: {
  review: DepositReviewGroup;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = evidenceStatus(review);

  return (
    <View className="overflow-hidden rounded-panel border border-rule bg-sheet">
      <SimulationCollapseToggle
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        expandedLabel="Hide Tenderly verification details"
        collapsedLabel="Show Tenderly verification details"
        icon={<TenderlyLogo size={18} color={status.color} />}
        title={status.label}
        subtitle={`${simulationChainLabel(review.chainId)} · ${review.calls.length} ${review.calls.length === 1 ? 'call' : 'calls'}`}
      />
      {expanded ? (
        <View className="border-t border-rule">
          {review.calls.map((call) => (
            <SimulationCallRow
              key={call.index}
              call={call}
              contracts={review.contracts}
              approvals={review.approvals}
            />
          ))}
          <SimulationEvidenceStats
            blockNumber={review.blockNumber}
            callGas={review.callGas}
            className="flex-row gap-4 border-t border-rule px-4 py-4"
          />
          <SimulationShareLinks
            shareUrls={review.shareUrls}
            label={(index) => `Result ${index + 1} · Tenderly`}
            className="gap-2 border-t border-rule px-4 py-4"
          />
        </View>
      ) : null}
    </View>
  );
}
