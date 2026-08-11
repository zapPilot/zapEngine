import type { DepositReviewGroup } from '@zapengine/types/api';
import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import {
  SimulationCallRow,
  SimulationCollapseToggle,
} from '@/components/invest/simulation/SimulationCallList';
import { Tap } from '@/components/ui/Tap';
import { TenderlyLogo } from '@/components/ui/TenderlyLogo';
import {
  formatInteger,
  simulationChainLabel,
} from '@/integration/simulationPreviewModel';

function evidenceStatus(review: DepositReviewGroup): {
  label: string;
  color: string;
} {
  if (review.status === 'failed') {
    return { label: 'Simulation failed', color: '#ff6f61' };
  }
  if (review.status === 'unavailable') {
    return { label: 'Simulation unavailable', color: '#a1a1aa' };
  }
  return { label: 'Verified by Tenderly', color: '#7ad88f' };
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
    <View className="overflow-hidden rounded-2xl border border-line bg-surface">
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
        <View className="border-t border-line">
          {review.calls.map((call) => (
            <SimulationCallRow
              key={call.index}
              call={call}
              contracts={review.contracts}
              approvals={review.approvals}
            />
          ))}
          <View className="flex-row gap-4 border-t border-line px-4 py-4">
            <View className="flex-1">
              <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
                Block
              </Text>
              <Text className="mt-1 font-mono text-[10px] text-ink-dim">
                {review.blockNumber?.toLocaleString('en-US') ?? 'Unavailable'}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
                Call gas
              </Text>
              <Text className="mt-1 font-mono text-[10px] text-ink-dim">
                {formatInteger(review.callGas)}
              </Text>
            </View>
          </View>
          {review.shareUrls.length > 0 ? (
            <View className="gap-2 border-t border-line px-4 py-4">
              <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
                Public simulation results
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {review.shareUrls.map((url, index) => (
                  <Tap
                    key={`${url}-${index}`}
                    accessibilityLabel={`View simulation ${index + 1} on Tenderly`}
                    accessibilityRole="link"
                    className="min-h-9 max-w-full flex-row items-center gap-2 rounded-xl border border-line-hi bg-bg px-3"
                    onPress={() => void Linking.openURL(url)}
                  >
                    <ExternalLink size={13} color="#d4c5a3" />
                    <Text
                      className="max-w-[230px] font-sans-semibold text-[10px] text-accent"
                      numberOfLines={1}
                    >
                      Result {index + 1} · Tenderly
                    </Text>
                  </Tap>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
