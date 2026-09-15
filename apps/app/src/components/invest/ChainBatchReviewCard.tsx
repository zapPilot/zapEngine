import { useState } from 'react';
import { Disclosure } from '@/components/ui/Disclosure';
import { formatUsd6 } from '@/lib/format';
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
  chainBatchActionSummary,
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
  stepLabel,
  destinationsDefaultExpanded = false,
}: {
  batch: ReviewedBatch;
  className?: string;
  stepLabel?: string;
  destinationsDefaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(destinationsDefaultExpanded);
  const totalUsd6 = batch.draft.positions.reduce(
    (sum, draft) => sum + BigInt(draft.usd6),
    0n,
  );

  return (
    <Card className={className}>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 font-sans-semibold text-[12.5px] text-ink">
          {stepLabel ? `${stepLabel} · ` : ''}
          {chainBatchLabel(batch.draft).split(' · ')[0]}
          {'\n'}
          {chainBatchActionSummary(batch.draft)}
        </Text>
        <Text className="font-mono-semibold text-[11px] text-accent">
          {formatUsd6(totalUsd6)}
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
      {batch.review.status === 'warning' ? (
        <View>
          <Text className="text-[10px] text-ink-dim">Heads up</Text>
          {batch.review.warnings.map((warning, index) => (
            <Text key={index} className="text-[11px] text-ink-dim">
              {warning.message}
            </Text>
          ))}
        </View>
      ) : null}
      <Disclosure
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        accessibilityLabel={`Destinations (${batch.draft.positions.length})`}
        header={
          <Text className="flex-1 text-[11px] text-ink-dim">
            Destinations ({batch.draft.positions.length})
          </Text>
        }
      >
        {batch.draft.positions.map((draft) => (
          <View
            key={draft.positionId}
            className="mt-3 border-t border-line pt-2"
          >
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
      </Disclosure>
      <View className="mt-3 border-t border-line pt-1">
        <SummaryRows rows={batchSummaryRows(batch.plan)} />
      </View>
    </Card>
  );
}
