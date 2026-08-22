import { useMarketDashboardQuery } from '@zapengine/app-core/hooks/queries';
import {
  buildTradeActions,
  deriveAllocationDiff,
  deriveGuardStates,
  deriveTriggerEvidence,
  formatRegimeLabel,
  getStatusPanelContent,
  type AllocationDiff,
  type DerivedTradeAction,
  type GuardStates,
  type StatusPanelContent,
  type TriggerEvidence,
} from '@zapengine/app-core/services/suggestion';
import type { MarketDashboardResponse } from '@zapengine/app-core/services';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';

import { useStrategySuggestion } from '@/integration/useStrategySuggestion';

export interface EvidenceChart {
  values: number[];
  dma: (number | null)[];
  latestValue: number | null;
  latestDma: number | null;
}

export interface StrategyDecisionPacket {
  status: DailySuggestionResponse['action']['status'];
  asOf: string;
  reason: string;
  regime: string;
  fearGreed: number | null;
  actions: DerivedTradeAction[];
  statusPanel: StatusPanelContent;
  trigger: TriggerEvidence;
  guards: GuardStates;
  allocation: AllocationDiff;
}

export function decisionPacketFromSuggestion(
  data: DailySuggestionResponse,
): StrategyDecisionPacket {
  const actions = buildTradeActions(data);
  return {
    status: data.action.status,
    asOf: data.as_of,
    reason: data.action.reason_code,
    regime: formatRegimeLabel(data.context.signal.regime),
    fearGreed: data.context.market.sentiment ?? null,
    actions,
    statusPanel: getStatusPanelContent(data, actions),
    trigger: deriveTriggerEvidence(data),
    guards: deriveGuardStates(data),
    allocation: deriveAllocationDiff(data),
  };
}

export function evidenceChartFromDashboard(
  dashboard: MarketDashboardResponse | undefined,
  seriesId: TriggerEvidence['chartSeriesId'],
): EvidenceChart | null {
  if (!dashboard || !seriesId) return null;
  const points = dashboard.snapshots.flatMap((snapshot) => {
    const point = snapshot.values[seriesId];
    return point
      ? [
          {
            value: point.value,
            dma: point.indicators['dma_200']?.value ?? null,
          },
        ]
      : [];
  });
  if (points.length < 2) return null;
  const latest = points.at(-1)!;
  return {
    values: points.map((point) => point.value),
    dma: points.map((point) => point.dma),
    latestValue: latest.value,
    latestDma: latest.dma,
  };
}

export function useStrategyDecisionPacket(userId: string | null) {
  const suggestion = useStrategySuggestion(userId);
  const packet = suggestion.data
    ? decisionPacketFromSuggestion(suggestion.data)
    : null;
  const dashboard = useMarketDashboardQuery(365, {
    enabled: packet?.trigger.chartSeriesId != null,
  });
  return {
    data: packet,
    chart: evidenceChartFromDashboard(
      dashboard.data,
      packet?.trigger.chartSeriesId ?? null,
    ),
    isLoading:
      suggestion.isLoading ||
      (packet?.trigger.chartSeriesId != null && dashboard.isLoading),
    isError: suggestion.isError || dashboard.isError,
  };
}
