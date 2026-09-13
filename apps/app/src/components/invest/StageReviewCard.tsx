import { Text, View } from 'react-native';

import { SimulationReviewBody } from '@/components/invest/simulation/SimulationReviewBody';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { stageSummaryRows } from '@/integration/investReviewModel';
import { stageLabel } from '@/integration/investTargetsModel';
import { resolveRouteProtocols } from '@/integration/simulationPreviewModel';
import type { ReviewedStage } from '@/integration/useInvestReview';

/**
 * One reviewed stage as the route and progress screens both render it: the
 * destination and its weight, the Tenderly evidence, then the plan facts that
 * evidence alone does not state.
 */
export function StageReviewCard({
  stage,
  className = 'p-4',
}: {
  stage: ReviewedStage;
  className?: string;
}) {
  const rows = stageSummaryRows({ draft: stage.draft, plan: stage.plan });

  return (
    <Card className={className}>
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 font-sans-semibold text-[12.5px] text-ink">
          {stageLabel(stage.draft)}
        </Text>
        <Text className="font-mono-semibold text-[11px] text-accent">
          {stage.draft.weightBps / 100}%
        </Text>
      </View>
      <SimulationReviewBody
        review={stage.review}
        protocols={resolveRouteProtocols(stage.plan, stage.review.groupId)}
      />
      <View className="mt-3 border-t border-line pt-1">
        {rows.map((row, index) => (
          <InfoRow
            key={row.label}
            label={row.label}
            value={row.value}
            divider={index < rows.length - 1}
          />
        ))}
      </View>
    </Card>
  );
}
