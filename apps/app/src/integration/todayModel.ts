import { deriveRuleTrace } from '@zapengine/app-core/services/suggestion';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { CAPABILITY_STATUS } from '@zapengine/zap-pilot-story/status';
import { DEMO } from '@/data/demo';
import type { TranslationKey } from '@/i18n/translations';
import type { SignRequest } from './fundFlowModel';
import { defaultRuleTrace, RULE_LABEL_KEYS } from './decisionTraceModel';
import {
  calculateAdjacentSnapshotChange,
  type DailyValuePoint,
} from './portfolioMetrics';
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
export type TodaySteps = ReturnType<typeof todaySteps>;
export function decisionStepStatuses(steps: TodaySteps) {
  return DECISION_STEP_IDS.map((id) =>
    id === 'plan'
      ? steps.planStatus
      : steps.observed && id !== 'check' && id !== 'sign'
        ? ('live' as const)
        : ('planned' as const),
  );
}
export function decisionStepCopy(steps: TodaySteps): {
  key: TranslationKey;
  params?: { fired: number; count: number };
}[] {
  return [
    { key: steps.observed ? 'today.signalsRead' : 'today.waitingReason' },
    steps.evaluated
      ? {
          key: 'today.firedCount',
          params: { fired: steps.fired, count: steps.ruleCount },
        }
      : { key: 'decision.ruleStatus.unavailable' },
    { key: steps.targetChanged ? 'today.targetUpdated' : 'today.unchanged' },
    { key: `status.${steps.planStatus}` },
    { key: steps.checkPending ? 'today.pending' : 'today.idle' },
    { key: steps.signPending ? 'today.signWaiting' : 'today.nothingToSign' },
  ];
}
const MS_PER_DAY = 86_400_000;
/** The money strip speaks in days: the last snapshot against the one before it. */
export function todayMoney(trendPoints: readonly DailyValuePoint[], days = 30) {
  const points = trendPoints.filter(
    (point) =>
      typeof point.total_value_usd === 'number' &&
      Number.isFinite(point.total_value_usd),
  );
  const last = points.at(-1);
  const previous = points.at(-2);
  const previousDate = previous?.date?.slice(0, 10);
  const gapDays =
    (Date.parse(last?.date ?? '') - Date.parse(previous?.date ?? '')) /
    MS_PER_DAY;
  return {
    asOf: last?.date?.slice(0, 10) ?? null,
    change: calculateAdjacentSnapshotChange(points),
    // A change over several calendar days must not be labelled a day change.
    sinceDate: gapDays > 1 && previousDate !== undefined ? previousDate : null,
    spark: points.slice(-days).map((point) => point.total_value_usd as number),
  };
}
export type TransferSleeve = 'btc' | 'eth' | 'spy' | 'stable';
export function transferSleeve(
  bucket: 'spot' | 'stable' | 'btc' | 'eth' | 'spy',
): TransferSleeve {
  return bucket === 'spot' ? 'btc' : bucket;
}
export type DriftKind = 'personal' | 'demoWallet' | 'referencePortfolio';
export function driftSubject({
  demo,
  source,
  suggestion,
}: {
  demo: boolean;
  source: VerdictSource;
  suggestion: DailySuggestionResponse | null;
}): {
  kind: DriftKind;
  yours: SleeveAllocation | null;
  totalUsd: number | null;
} {
  if (demo)
    return {
      kind: 'demoWallet',
      yours: DEMO.home.sleeveAllocation,
      totalUsd: DEMO.home.totalBalance,
    };
  return {
    kind: source === 'personal' ? 'personal' : 'referencePortfolio',
    yours: suggestion?.context.portfolio.asset_allocation ?? null,
    totalUsd: suggestion?.context.portfolio.total_value ?? null,
  };
}
export function driftRows(
  target: SleeveAllocation | null,
  yours: SleeveAllocation | null,
  totalUsd: number | null,
) {
  if (target === null || yours === null) return { rows: [], aligned: false };
  const rows = TARGET_SLEEVES.map((id) => {
    const targetPct = target[id] * 100;
    const yoursPct = yours[id] * 100;
    const raw = targetPct - yoursPct;
    return {
      id,
      target: targetPct,
      yours: yoursPct,
      gap: Math.round(raw * 10) / 10,
      usd: totalUsd !== null && totalUsd > 0 ? (raw / 100) * totalUsd : null,
      distance: Math.abs(raw),
    };
  })
    .filter((row) => row.target > 0 || row.yours > 0)
    .sort((a, b) => b.distance - a.distance);
  return {
    rows,
    aligned: rows.length > 0 && rows.every((row) => row.gap === 0),
  };
}
