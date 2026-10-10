import { expect, it } from 'vitest';
import {
  resolveVerdictSource,
  verdictFromSuggestion,
  todaySteps,
  targetVsYours,
  todayValueChange,
  ruleLabelKey,
  decisionStepCopy,
  decisionStepStatuses,
  todayMoney,
  transferSleeve,
  driftSubject,
  driftRows,
} from '@/integration/todayModel';
import { DEMO } from '@/data/demo';
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
it('turns the step trace into rail statuses and copy without a suggestion', () => {
  const rules = defaultPortfolioRules(referenceConfigs());
  const waiting = todaySteps(null, rules, null);
  expect(decisionStepStatuses(waiting)).toEqual([
    'planned',
    'planned',
    'planned',
    'planned',
    'planned',
    'planned',
  ]);
  expect(decisionStepCopy(waiting).map((entry) => entry.key)).toEqual([
    'today.waitingReason',
    'decision.ruleStatus.unavailable',
    'today.unchanged',
    'status.planned',
    'today.idle',
    'today.nothingToSign',
  ]);
});
it('marks observed steps live and carries sign requests into check and sign', () => {
  const rules = defaultPortfolioRules(referenceConfigs());
  const data = suggestion();
  data.action.transfers = [
    { from_bucket: 'btc', to_bucket: 'stable', amount_usd: 1 },
  ];
  const steps = todaySteps(data, rules, {
    kind: 'review',
    amountUsd: 10,
    expiresAt: null,
  });
  expect(decisionStepStatuses(steps)).toEqual([
    'live',
    'live',
    'live',
    'planned',
    'planned',
    'planned',
  ]);
  expect(decisionStepCopy(steps)).toEqual([
    { key: 'today.signalsRead' },
    { key: 'today.firedCount', params: { fired: 0, count: 6 } },
    { key: 'today.targetUpdated' },
    { key: 'status.planned' },
    { key: 'today.pending' },
    { key: 'today.signWaiting' },
  ]);
});
it('summarizes the money strip from the last two snapshots', () => {
  const points = [
    { date: '2026-10-07', total_value_usd: 90 },
    { date: '2026-10-08', total_value_usd: 95 },
    { date: '2026-10-09T00:00:00Z', total_value_usd: 100 },
  ];
  const money = todayMoney(points);
  expect(money.asOf).toBe('2026-10-09');
  expect(money.change).toEqual({ usd: 5, pct: (5 / 95) * 100 });
  expect(money.sinceDate).toBeNull();
  expect(money.spark).toEqual([90, 95, 100]);
  expect(todayMoney(points, 2).spark).toEqual([95, 100]);
});
it('names the earlier snapshot only when the last two are days apart', () => {
  expect(
    todayMoney([
      { date: '2026-10-05', total_value_usd: 90 },
      { date: '2026-10-09', total_value_usd: 100 },
    ]).sinceDate,
  ).toBe('2026-10-05');
  expect(
    todayMoney([{ total_value_usd: 90 }, { total_value_usd: 100 }]).sinceDate,
  ).toBeNull();
});
it('ignores unusable snapshots and survives empty input', () => {
  const money = todayMoney([
    { date: '2026-10-08', total_value_usd: Number.NaN },
    { date: '2026-10-09' },
  ]);
  expect(money).toEqual({
    asOf: null,
    change: null,
    sinceDate: null,
    spark: [],
  });
});
it('maps the spot bucket to BTC and leaves sleeves alone', () => {
  expect(transferSleeve('spot')).toBe('btc');
  expect(transferSleeve('stable')).toBe('stable');
});
it('picks the drift subject: demo wallet, reference portfolio or personal', () => {
  const data = suggestion();
  expect(
    driftSubject({ demo: true, source: 'reference', suggestion: data }),
  ).toEqual({
    kind: 'demoWallet',
    yours: DEMO.home.sleeveAllocation,
    totalUsd: DEMO.home.totalBalance,
  });
  expect(
    driftSubject({ demo: false, source: 'reference', suggestion: data }),
  ).toEqual({
    kind: 'referencePortfolio',
    yours: data.context.portfolio.asset_allocation,
    totalUsd: data.context.portfolio.total_value,
  });
  expect(
    driftSubject({ demo: false, source: 'personal', suggestion: data }).kind,
  ).toBe('personal');
  expect(
    driftSubject({ demo: false, source: 'personal', suggestion: null }),
  ).toEqual({ kind: 'personal', yours: null, totalUsd: null });
});
const allocation = (btc: number, eth: number, spy: number, stable: number) => ({
  btc,
  eth,
  spy,
  stable,
  alt: 0,
});
it('orders drift by distance and prices it against the portfolio', () => {
  const { rows, aligned } = driftRows(
    allocation(0, 0.141, 0.488, 0.371),
    allocation(0.05, 0.205, 0.477, 0.268),
    24_815.6,
  );
  expect(aligned).toBe(false);
  expect(rows.map((row) => [row.id, row.gap])).toEqual([
    ['stable', 10.3],
    ['eth', -6.4],
    ['btc', -5],
    ['spy', 1.1],
  ]);
  expect(rows[0]!.usd).toBeCloseTo(2556, 0);
  expect(rows[1]!.usd).toBeCloseTo(-1588.2, 1);
});
it('hides sleeves nobody holds or targets and leaves dollars blank without a total', () => {
  const { rows } = driftRows(
    allocation(0, 0, 0, 1),
    allocation(0, 0, 0, 0.5),
    null,
  );
  expect(rows.map((row) => row.id)).toEqual(['stable']);
  expect(rows[0]!.usd).toBeNull();
  expect(
    driftRows(allocation(0, 0, 0, 1), allocation(0, 0, 0, 0.5), 0).rows[0]!.usd,
  ).toBeNull();
});
it('reports alignment only when every gap rounds to zero', () => {
  const same = allocation(0.2, 0.2, 0, 0.6);
  expect(driftRows(same, same, 100).aligned).toBe(true);
  expect(driftRows(same, allocation(0.2004, 0.2, 0, 0.5996), 100).aligned).toBe(
    true,
  );
  expect(driftRows(null, same, 100)).toEqual({ rows: [], aligned: false });
  expect(driftRows(same, null, 100)).toEqual({ rows: [], aligned: false });
  expect(
    driftRows(allocation(0, 0, 0, 0), allocation(0, 0, 0, 0), 100),
  ).toEqual({ rows: [], aligned: false });
});
