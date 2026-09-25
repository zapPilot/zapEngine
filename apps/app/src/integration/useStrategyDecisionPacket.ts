import {
  buildTradeActions,
  deriveAllocationDiff,
  deriveGuardStates,
  deriveRuleTrace,
  deriveTriggerEvidence,
  formatRegimeLabel,
  getStatusPanelContent,
  type AllocationDiff,
  type DerivedTradeAction,
  type GuardStates,
  type RuleTraceEntry,
  type StatusPanelContent,
  type TriggerEvidence,
} from '@zapengine/app-core/services/suggestion';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';

import { useStrategySuggestion } from '@/integration/useStrategySuggestion';

export interface StrategyDecisionPacket {
  status: DailySuggestionResponse['action']['status'];
  asOf: string;
  reason: string;
  regime: string;
  fearGreed: number | null;
  actions: DerivedTradeAction[];
  statusPanel: StatusPanelContent;
  trigger: TriggerEvidence;
  ruleTrace: RuleTraceEntry[];
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
    ruleTrace: deriveRuleTrace(data),
    guards: deriveGuardStates(data),
    allocation: deriveAllocationDiff(data),
  };
}

export function useStrategyDecisionPacket(userId: string | null) {
  const suggestion = useStrategySuggestion(userId);
  return {
    data: suggestion.data
      ? decisionPacketFromSuggestion(suggestion.data)
      : null,
    isLoading: suggestion.isLoading,
    isError: suggestion.isError,
  };
}
