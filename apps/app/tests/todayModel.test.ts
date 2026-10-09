import { expect, it } from 'vitest';
import {
  resolveVerdictSource,
  verdictFromSuggestion,
  todaySteps,
  targetVsYours,
  todayValueChange,
  ruleLabelKey,
} from '@/integration/todayModel';
import {
  referenceSuggestionFromBacktest,
  defaultPortfolioRules,
} from '@/integration/referenceStrategyModel';
import {
  referenceConfigs,
  referenceResponse,
} from './support/referenceStrategyFixtures';
const suggestion = () => referenceSuggestionFromBacktest(referenceResponse())!;
it.each([
  ['ios', true, 100, 'reference'],
  ['web', false, 100, 'reference'],
  ['android', true, 0, 'reference'],
  ['web', true, null, 'reference'],
  ['web', true, 100, 'personal'],
] as const)(
  'resolves %s connected=%s net=%s to %s',
  (platformOS, isConnected, netWorth, expected) => {
    expect(resolveVerdictSource({ platformOS, isConnected, netWorth })).toBe(
      expected,
    );
  },
);
it('takes its verdict from the settled authoritative suggestion', () => {
  const data = suggestion();
  expect(verdictFromSuggestion(null)).toBe('unavailable');
  expect(verdictFromSuggestion(data)).toBe('hold');
  data.action.status = 'blocked';
  expect(verdictFromSuggestion(data)).toBe('blocked');
  data.action.status = 'action_required';
  data.context.strategy.stance = 'sell';
  expect(verdictFromSuggestion(data)).toBe('exit');
  data.context.strategy.stance = 'buy';
  expect(verdictFromSuggestion(data)).toBe('enter');
  data.context.strategy.stance = 'hold';
  expect(verdictFromSuggestion(data)).toBe('rebalance');
});
it('counts only default rule trace and uses the canonical planned rebalance status', () => {
  const data = suggestion();
  const rules = defaultPortfolioRules(referenceConfigs());
  expect(todaySteps(data, rules, null)).toMatchObject({
    observed: true,
    evaluated: true,
    fired: 0,
    ruleCount: 6,
    planStatus: 'planned',
    signPending: false,
  });
  data.context.strategy.details = {
    matched_rule_name: 'cross_down_exit',
    portfolio_rule_matches: [
      { rule_name: 'cross_down_exit', matched: true },
      { rule_name: 'nondefault', matched: true },
    ],
  };
  data.action.transfers = [
    { from_bucket: 'btc', to_bucket: 'stable', amount_usd: 100 },
  ];
  expect(
    todaySteps(data, rules, {
      kind: 'review',
      amountUsd: 100,
      expiresAt: null,
    }),
  ).toMatchObject({
    fired: 1,
    targetChanged: true,
    checkPending: true,
    signPending: true,
  });
  expect(todaySteps(null, rules, null)).toMatchObject({
    observed: false,
    evaluated: false,
  });
});
it('keeps target and holdings independent, including untracked or zero sleeves', () => {
  const target = suggestion().context.target.allocation;
  const yours = { ...target, spy: 0.4, stable: 0.2 };
  expect(
    targetVsYours(target, yours).find((row) => row.id === 'spy'),
  ).toMatchObject({ target: 0, yours: 40, gap: -40 });
  expect(
    targetVsYours(null, null).every(
      (row) => row.target === null && row.yours === null && row.gap === null,
    ),
  ).toBe(true);
  expect(targetVsYours(target, null)[0]?.target).toBe(20);
  expect(targetVsYours(null, yours)[0]?.yours).toBe(20);
});
it('does not turn absent or invalid snapshots into invented daily change', () => {
  expect(todayValueChange(110, 100)).toEqual({
    usd: 10,
    percent: expect.closeTo(10),
  });
  for (const [current, previous] of [
    [null, 100],
    [100, null],
    [NaN, 100],
    [100, Infinity],
    [100, 0],
  ] as const)
    expect(todayValueChange(current, previous)).toBeNull();
  expect(ruleLabelKey('cross_down_exit')).toBe('strategy.rule.crossDownExit');
  expect(ruleLabelKey('future-rule')).toBeNull();
});
