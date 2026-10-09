import { expect, it } from 'vitest';
import { decisionLogEntries } from '@/integration/decisionLogModel';
import { defaultPortfolioRules } from '@/integration/referenceStrategyModel';
import {
  referenceConfigs,
  referenceResponse,
  referencePoint,
} from './support/referenceStrategyFixtures';
it('folds held spans and preserves every transfer date in reverse chronology', () => {
  const response = referenceResponse();
  const market = response.timeline[0]!.market;
  response.timeline = [1, 2, 3, 4, 5].map((day) => ({
    market: { ...market, date: `2026-10-0${day}` },
    strategies: { reference: referencePoint() },
  }));
  const event = response.timeline[2]!.strategies.reference!;
  event.execution.transfers = [
    { from_bucket: 'btc', to_bucket: 'stable', amount_usd: 1050 },
  ];
  event.decision.reason = 'portfolio_cross_down_exit';
  const rows = decisionLogEntries(
    response,
    defaultPortfolioRules(referenceConfigs()),
  );
  expect(rows).toHaveLength(3);
  expect(rows[0]).toEqual({
    kind: 'held',
    start: '2026-10-04',
    end: '2026-10-05',
  });
  expect(rows[1]).toMatchObject({
    kind: 'rule',
    date: '2026-10-03',
    ruleName: 'cross_down_exit',
    ruleNumber: 1,
    percent: 10,
  });
  expect(rows[2]).toEqual({
    kind: 'held',
    start: '2026-10-01',
    end: '2026-10-02',
  });
});
it('does not label absent strategy observations as held and keeps unknown triggers unnumbered', () => {
  const response = referenceResponse();
  response.timeline[0]!.strategies = {};
  const point = response.timeline[1]!.strategies.reference!;
  point.execution.transfers = [
    { from_bucket: 'btc', to_bucket: 'stable', amount_usd: 10 },
  ];
  point.portfolio.total_value = 0;
  point.decision.details = { matched_rule_name: 'new-rule' };
  expect(decisionLogEntries(response, [])[0]).toMatchObject({
    kind: 'rule',
    ruleNumber: null,
    percent: null,
    ruleName: 'new-rule',
  });
  delete point.decision.details;
  expect(decisionLogEntries(response, [])[0]).toMatchObject({ ruleName: null });
  response.strategies = {};
  expect(decisionLogEntries(response, [])).toEqual([]);
});
