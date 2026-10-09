import { deriveRuleTrace } from '@zapengine/app-core/services/suggestion';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { CAPABILITY_STATUS } from '@zapengine/zap-pilot-story/status';
import type { SignRequest } from './fundFlowModel';
import { defaultRuleTrace, RULE_LABEL_KEYS } from './decisionTraceModel';
export type VerdictSource = 'reference' | 'personal';
export function resolveVerdictSource({
  platformOS,
  isConnected,
  netWorth,
}: {
  platformOS: string;
  isConnected: boolean;
  netWorth: number | null;
}): VerdictSource {
  return platformOS === 'ios' ||
    !isConnected ||
    netWorth === null ||
    netWorth <= 0
    ? 'reference'
    : 'personal';
}
export function verdictFromSuggestion(
  suggestion: DailySuggestionResponse | null,
) {
  if (!suggestion) return 'unavailable';
  if (suggestion.action.status === 'blocked') return 'blocked';
  if (suggestion.action.status === 'no_action') return 'hold';
  if (suggestion.context.strategy.stance === 'sell') return 'exit';
  if (suggestion.context.strategy.stance === 'buy') return 'enter';
  return 'rebalance';
}
export const DECISION_STEP_IDS = [
  'observe',
  'evaluate',
  'target',
  'plan',
  'check',
  'sign',
] as const;
export function todaySteps(
  suggestion: DailySuggestionResponse | null,
  rules: readonly { name: string; number: number }[],
  signRequest: SignRequest | null,
) {
  const trace = defaultRuleTrace(
    rules,
    suggestion ? deriveRuleTrace(suggestion) : [],
  );
  const fired = trace.filter((rule) => rule.trace?.status === 'fired').length;
  return {
    observed: suggestion !== null,
    evaluated: trace.some((rule) => rule.trace !== null),
    fired,
    ruleCount: rules.length,
    targetChanged:
      suggestion !== null && suggestion.action.transfers.length > 0,
    planStatus: CAPABILITY_STATUS['rebalance-plans'],
    checkPending: signRequest !== null,
    signPending: signRequest !== null,
  };
}
export type SleeveAllocation =
  DailySuggestionResponse['context']['target']['allocation'];
export const TARGET_SLEEVES = ['btc', 'eth', 'spy', 'stable', 'alt'] as const;
export function targetVsYours(
  target: SleeveAllocation | null,
  yours: SleeveAllocation | null,
) {
  return TARGET_SLEEVES.map((id) => ({
    id,
    target: target === null ? null : target[id] * 100,
    yours: yours === null ? null : yours[id] * 100,
    gap:
      target === null || yours === null ? null : (target[id] - yours[id]) * 100,
  }));
}
export function todayValueChange(
  current: number | null,
  previous: number | null,
) {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous <= 0
  )
    return null;
  return { usd: current - previous, percent: (current / previous - 1) * 100 };
}
export function ruleLabelKey(name: string) {
  return RULE_LABEL_KEYS[name] ?? null;
}
