import { expect, it } from 'vitest';
import {
  backtestStats,
  defaultPortfolioRules,
  referenceStrategyId,
  referenceSuggestionFromBacktest,
  ruleNameFromReason,
  ruleNumberFromReason,
} from '@/integration/referenceStrategyModel';
import {
  referenceConfigs,
  referenceResponse,
  referenceSpecRef,
} from './support/referenceStrategyFixtures';
it('numbers rules by priority without mutating catalog data', () => {
  const configs = referenceConfigs();
  configs.portfolio_rules!.reverse();
  expect(
    defaultPortfolioRules(configs).map(({ name, number }) => [name, number]),
  ).toEqual(
    referenceConfigs().portfolio_rules!.map(({ name }, index) => [
      name,
      index + 1,
    ]),
  );
  expect(configs.portfolio_rules![0]?.name).toBe('fgi_downshift_dca_sell');
  expect(
    defaultPortfolioRules({ ...configs, portfolio_rules: undefined }),
  ).toEqual([]);
});
it('keeps reference and DCA numbers distinct', () => {
  expect(backtestStats(referenceResponse())).toEqual({
    rulesRoi: 5,
    dcaRoi: 1,
    maxDrawdown: -2,
  });
  const missingDrawdown = referenceResponse();
  delete missingDrawdown.strategies.reference!.max_drawdown_percent;
  expect(backtestStats(missingDrawdown).maxDrawdown).toBeNull();
  const response = referenceResponse();
  delete response.strategies.reference;
  expect(referenceStrategyId(response)).toBeNull();
  expect(backtestStats(response).rulesRoi).toBeNull();
  response.strategies = {};
  expect(backtestStats(response)).toEqual({
    rulesRoi: null,
    dcaRoi: null,
    maxDrawdown: null,
  });
});
it('converts the last real timeline point into a suggestion with its trace and freshness', () => {
  const response = referenceResponse();
  const suggestion = referenceSuggestionFromBacktest(response)!;
  expect(suggestion.as_of).toBe('2026-10-02');
  expect(suggestion.action).toMatchObject({
    status: 'no_action',
    required: false,
    kind: null,
  });
  expect(suggestion.context.portfolio).toEqual(
    response.timeline[1]?.strategies.reference?.portfolio,
  );
  expect(suggestion.context.strategy.details).toEqual(
    response.timeline[1]?.strategies.reference?.decision.details,
  );
  expect(suggestion.spec_ref).toBe(referenceSpecRef);
  expect(suggestion.context.model).toEqual({
    allocation:
      response.timeline[1]?.strategies.reference?.portfolio.asset_allocation,
    window: response.window,
  });
});
it('derives status from transfers or blocked execution only when the server omits status', () => {
  const response = referenceResponse();
  const point = response.timeline[1]!.strategies.reference!;
  delete point.execution.status;
  point.execution.transfers = [
    { from_bucket: 'btc', to_bucket: 'spy', amount_usd: 100 },
  ];
  expect(referenceSuggestionFromBacktest(response)?.action).toMatchObject({
    status: 'action_required',
    required: true,
    kind: 'rebalance',
  });
  point.execution.blocked_reason = 'cooldown';
  expect(referenceSuggestionFromBacktest(response)?.action.status).toBe(
    'blocked',
  );
  point.execution.transfers = [];
  point.execution.blocked_reason = null;
  expect(referenceSuggestionFromBacktest(response)?.action.status).toBe(
    'no_action',
  );
  delete point.decision.details;
  expect(
    referenceSuggestionFromBacktest(response)?.context.strategy.details,
  ).toBeUndefined();
});
it('does not fabricate a decision when timeline or signal data is absent', () => {
  const response = referenceResponse();
  response.timeline = [];
  expect(referenceSuggestionFromBacktest(response)).toBeNull();
  const other = referenceResponse();
  other.timeline[1]!.strategies.reference!.signal = null;
  expect(referenceSuggestionFromBacktest(other)).toBeNull();
  const missing = referenceResponse();
  delete missing.timeline[1]!.strategies.reference;
  expect(referenceSuggestionFromBacktest(missing)).toBeNull();
  missing.strategies = {};
  expect(referenceSuggestionFromBacktest(missing)).toBeNull();
  const unwindowed = referenceResponse();
  delete unwindowed.window;
  expect(referenceSuggestionFromBacktest(unwindowed)).toBeNull();
  const unnamed = referenceResponse();
  unnamed.strategies.reference!.parameters = {};
  expect(referenceSuggestionFromBacktest(unnamed)).toBeNull();
});
it('maps decision reason codes to configured rule numbers and leaves hold unnumbered', () => {
  const rules = defaultPortfolioRules(referenceConfigs());
  expect(ruleNameFromReason('portfolio_cross_down_exit')).toBe(
    'cross_down_exit',
  );
  expect(ruleNameFromReason('cross_up_equal_weight')).toBe(
    'cross_up_equal_weight',
  );
  expect(ruleNumberFromReason('portfolio_cross_down_exit', rules)).toBe(1);
  expect(ruleNumberFromReason('regime_no_signal', rules)).toBeNull();
});
