import { Text, View } from 'react-native';

import { SimulationReviewBody } from '@/components/invest/simulation/SimulationReviewBody';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import {
  batchSummaryRows,
  positionSummaryRows,
  type StageSummaryRow,
} from '@/integration/investReviewModel';
import {
  batchProtocolWeightsBps,
  chainBatchLabel,
  stageLabel,
} from '@/integration/investTargetsModel';
import { resolveRouteProtocols } from '@/integration/simulationPreviewModel';
import type { ReviewedBatch } from '@/integration/useInvestReview';

function SummaryRows({ rows }: { rows: readonly StageSummaryRow[] }) {
  return (
    <>
      {rows.map((row, index) => (
        <InfoRow
          key={row.label}
          label={row.label}
          value={row.value}
          divider={index < rows.length - 1}
        />
      ))}
    </>
  );
}

/**
 * One reviewed wallet batch as the route and progress screens both render it:
 * the source chain and the venues it funds, the Tenderly evidence for the one
 * bundle they share, then each destination's own facts and the batch totals.
 */
export function ChainBatchReviewCard({
  batch,
  className = 'p-4',
}: {
  batch: ReviewedBatch;
  className?: string;
}) {
  const totalWeightBps = batch.draft.positions.reduce(
    (sum, draft) => sum + draft.weightBps,
    0,
  );

  return (
    <Card className={className}>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 font-sans-semibold text-[12.5px] text-ink">
          {chainBatchLabel(batch.draft)}
        </Text>
        <Text className="font-mono-semibold text-[11px] text-accent">
          {totalWeightBps / 100}%
        </Text>
      </View>
      <SimulationReviewBody
        review={batch.review}
        protocols={resolveRouteProtocols(
          batch.plan,
          batch.review.groupId,
          batchProtocolWeightsBps(batch.draft),
        )}
      />
      {batch.draft.positions.map((draft) => (
        <View key={draft.positionId} className="mt-3 border-t border-line pt-2">
          <View className="mb-1 flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 font-sans-medium text-[11px] text-ink-dim">
              {stageLabel(draft)}
            </Text>
            <Text className="font-mono-semibold text-[10px] text-ink-faint">
              {draft.weightBps / 100}%
            </Text>
          </View>
          <SummaryRows
            rows={positionSummaryRows({ draft, plan: batch.plan })}
          />
        </View>
      ))}
      <View className="mt-3 border-t border-line pt-1">
        <SummaryRows rows={batchSummaryRows(batch.plan)} />
      </View>
    </Card>
  );
}
