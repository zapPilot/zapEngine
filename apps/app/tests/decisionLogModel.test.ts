import { expect, it } from 'vitest';
import {
  decisionLogEntries,
  decisionRhythm,
} from '@/integration/decisionLogModel';
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
function rhythmResponse() {
  const response = referenceResponse();
  const market = response.timeline[0]!.market;
  response.timeline = [1, 2, 3, 4, 5].map((day) => ({
    market: { ...market, date: `2026-10-0${day}` },
    strategies: { reference: referencePoint() },
  }));
  response.timeline[1]!.strategies.reference!.execution.transfers = [
    { from_bucket: 'btc', to_bucket: 'stable', amount_usd: 100 },
  ];
  return response;
}
const rules = defaultPortfolioRules(referenceConfigs());
it('lays out the last calendar days as fired, held or unknown', () => {
  const rhythm = decisionRhythm(rhythmResponse(), rules, 7);
  expect(rhythm.days.map((day) => [day.date, day.fired])).toEqual([
    ['2026-09-29', null],
    ['2026-09-30', null],
    ['2026-10-01', false],
    ['2026-10-02', true],
    ['2026-10-03', false],
    ['2026-10-04', false],
    ['2026-10-05', false],
  ]);
  expect(rhythm.moves.map((move) => move.date)).toEqual(['2026-10-02']);
});
it('keeps only moves inside the window, newest first, and treats sampled-out days as held', () => {
  const response = rhythmResponse();
  response.timeline[3]!.strategies = {};
  response.timeline[0]!.strategies.reference!.execution.transfers = [
    { from_bucket: 'btc', to_bucket: 'stable', amount_usd: 1 },
  ];
  response.timeline[4]!.strategies.reference!.execution.transfers = [
    { from_bucket: 'eth', to_bucket: 'stable', amount_usd: 2 },
  ];
  const rhythm = decisionRhythm(response, rules, 3);
  expect(rhythm.days.map((day) => day.fired)).toEqual([false, false, true]);
  expect(rhythm.moves.map((move) => move.date)).toEqual(['2026-10-05']);
  expect(decisionRhythm(response, rules).moves).toHaveLength(3);
});
it('marks every day unknown when no day carries the strategy', () => {
  const response = rhythmResponse();
  for (const day of response.timeline) day.strategies = {};
  expect(decisionRhythm(response, rules, 2).days.map((d) => d.fired)).toEqual([
    null,
    null,
  ]);
});
it('returns nothing without a reference strategy or a parsable last date', () => {
  const noStrategy = rhythmResponse();
  noStrategy.strategies = {};
  expect(decisionRhythm(noStrategy, rules)).toEqual({ days: [], moves: [] });
  const noTimeline = rhythmResponse();
  noTimeline.timeline = [];
  expect(decisionRhythm(noTimeline, rules)).toEqual({ days: [], moves: [] });
  const badDate = rhythmResponse();
  badDate.timeline.at(-1)!.market.date = 'not-a-date';
  expect(decisionRhythm(badDate, rules)).toEqual({ days: [], moves: [] });
});
