import type { DepositReviewGroup } from '@zapengine/types/api';
import { Text, View } from 'react-native';

import { SimulationFlowRows } from '@/components/invest/simulation/SimulationFlowRows';
import {
  SectionLabel,
  SimulationBlockingBanner,
} from '@/components/invest/simulation/SimulationReviewPrimitives';
import { SimulationTenderlyEvidence } from '@/components/invest/simulation/SimulationTenderlyEvidence';
import { ChainMark } from '@/components/token/ChainMark';
import { ProtocolIcon } from '@/components/token/ProtocolIcon';
import {
  partitionAssetChanges,
  simulationChainKey,
  simulationChainLabel,
  type RouteProtocolContext,
} from '@/integration/simulationPreviewModel';

function BlockingBanner({ review }: { review: DepositReviewGroup }) {
  const failed = review.status === 'failed';
  const reason = failed
    ? review.failureReason
    : review.status === 'unavailable'
      ? review.unavailableReason
      : null;
  if (!reason) return null;
  return <SimulationBlockingBanner failed={failed} reason={reason} />;
}

function ProtocolChip({ protocol }: { protocol: RouteProtocolContext }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-line py-1 pl-1 pr-3">
      <ProtocolIcon protocol={protocol.protocol} size={20} />
      <Text
        className="font-sans-medium text-[10.5px] text-ink"
        numberOfLines={1}
      >
        {protocol.label}
      </Text>
      <Text className="font-mono-semibold text-[8px] uppercase tracking-[.5px] text-ink-faint">
        {protocol.badge}
      </Text>
    </View>
  );
}

export interface SimulationReviewBodyProps {
  review: DepositReviewGroup;
  /** The plan allocations this chain's bundle touches, for the header chips. */
  protocols: readonly RouteProtocolContext[];
}

/**
 * Wallet-neutral Tenderly review content for the unified invest route.  It is
 * deliberately independent from the legacy Privy preview's signing envelope
 * so both Privy and external wallets render the same evidence in Step 2.
 */
export function SimulationReviewBody({
  review,
  protocols,
}: SimulationReviewBodyProps) {
  const { incoming, outgoing } = partitionAssetChanges(review.assetChanges);
  const chainKey = simulationChainKey(review.chainId);

  return (
    <View className="gap-5">
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="flex-row items-center gap-2 rounded-full border border-line py-1 pl-1.5 pr-3">
          {chainKey ? <ChainMark chainKey={chainKey} size={17} /> : null}
          <Text className="font-sans-medium text-[10.5px] text-ink">
            {simulationChainLabel(review.chainId)}
          </Text>
        </View>
        {protocols.map((protocol) => (
          <ProtocolChip key={protocol.id} protocol={protocol} />
        ))}
      </View>

      <BlockingBanner review={review} />

      <View>
        <SectionLabel>Route flow</SectionLabel>
        <SimulationFlowRows
          approvals={review.approvals}
          outgoing={outgoing}
          incoming={incoming}
          contracts={review.contracts}
        />
      </View>

      <SimulationTenderlyEvidence review={review} />
    </View>
  );
}
