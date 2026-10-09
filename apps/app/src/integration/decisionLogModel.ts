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
