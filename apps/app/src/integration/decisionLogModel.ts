import type {
  BacktestResponse,
  BacktestTransferMetadata,
} from '@zapengine/app-core/types/backtesting';
import {
  referenceStrategyId,
  ruleNameFromReason,
} from './referenceStrategyModel';
export type DecisionLogEntry =
  | { kind: 'held'; start: string; end: string }
  | {
      kind: 'rule';
      date: string;
      ruleName: string | null;
      ruleNumber: number | null;
      transfers: readonly BacktestTransferMetadata[];
      percent: number | null;
    };
/** Transfer dates survive server sampling; only stretches without transfers fold together. */
export function decisionLogEntries(
  response: BacktestResponse,
  rules: readonly { name: string; number: number }[],
): DecisionLogEntry[] {
  const id = referenceStrategyId(response);
  if (id === null) return [];
  const rows: DecisionLogEntry[] = [];
  let held: { kind: 'held'; start: string; end: string } | null = null;
  const flush = () => {
    if (held) {
      rows.push(held);
      held = null;
    }
  };
  for (const day of response.timeline) {
    const point = day.strategies[id];
    if (!point) {
      flush();
      continue;
    }
    if (point.execution.transfers.length === 0) {
      if (held) held.end = day.market.date;
      else
        held = { kind: 'held', start: day.market.date, end: day.market.date };
      continue;
    }
    flush();
    const matched = point.decision.details?.matched_rule_name;
    const name =
      typeof matched === 'string'
        ? matched
        : ruleNameFromReason(point.decision.reason);
    rows.push({
      kind: 'rule',
      date: day.market.date,
      ruleName: name,
      ruleNumber: rules.find((rule) => rule.name === name)?.number ?? null,
      transfers: point.execution.transfers,
      percent:
        point.portfolio.total_value > 0
          ? (point.execution.transfers.reduce(
              (sum, transfer) => sum + transfer.amount_usd,
              0,
            ) /
              point.portfolio.total_value) *
            100
          : null,
    });
  }
  flush();
  return rows.reverse();
}
const MS_PER_DAY = 86_400_000;
export type RhythmDay = { date: string; fired: boolean | null };
/**
 * The last `days` calendar days of the reference strategy. Transfer days survive
 * server sampling, so a day after the first observation with no transfer is a
 * hold; days before it are unknown.
 */
export function decisionRhythm(
  response: BacktestResponse,
  rules: readonly { name: string; number: number }[],
  days = 30,
): {
  days: RhythmDay[];
  moves: Extract<DecisionLogEntry, { kind: 'rule' }>[];
} {
  const id = referenceStrategyId(response);
  const lastDate = response.timeline.at(-1)?.market.date;
  const end = Date.parse(lastDate ?? '');
  if (id === null || Number.isNaN(end)) return { days: [], moves: [] };
  const fired = new Map<string, boolean>();
  for (const day of response.timeline) {
    const point = day.strategies[id];
    if (point) fired.set(day.market.date, point.execution.transfers.length > 0);
  }
  const first = fired.keys().next().value;
  const window: RhythmDay[] = Array.from({ length: days }, (_, index) => {
    const date = new Date(end - (days - 1 - index) * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);
    const known = fired.get(date);
    return {
      date,
      fired:
        known !== undefined
          ? known
          : first !== undefined && date > first
            ? false
            : null,
    };
  });
  const start = window[0]!.date;
  return {
    days: window,
    moves: decisionLogEntries(response, rules).filter(
      (row): row is Extract<DecisionLogEntry, { kind: 'rule' }> =>
        row.kind === 'rule' && row.date >= start,
    ),
  };
}
