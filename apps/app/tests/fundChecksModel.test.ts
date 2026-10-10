import { expect, it } from 'vitest';
import type {
  DepositPlan,
  DepositReviewGroup,
  StrategyDepositPlan,
} from '@zapengine/types/api';
import { fundChecksFromReviews } from '@/integration/fundChecksModel';
const review = (
  status: DepositReviewGroup['status'] = 'passed',
  unlimited = false,
) =>
  ({
    status,
    groupId: 'base',
    approvals: [{ unlimited }],
  }) as DepositReviewGroup;
const plan = (minimum = '12', approvals = 1) =>
  ({
    legs: [{ toAmountMin: minimum }],
    approvals: Array.from({ length: approvals }, () => ({})),
  }) as DepositPlan;
it('reads bounded approvals and minimum received from the prepared plan', () => {
  expect(
    fundChecksFromReviews([{ plan: plan(), review: review() }], true),
  ).toEqual([
    { id: 'approvals', status: 'checked' },
    { id: 'minimum', status: 'checked', minimums: ['12'] },
    { id: 'simulation', status: 'checked' },
    { id: 'hypercore', status: 'not-simulated' },
  ]);
});
it.each(['failed', 'warning', 'unavailable'] as const)(
  'keeps the worst %s evidence across reviews',
  (status) => {
    expect(
      fundChecksFromReviews(
        [
          { plan: plan(), review: review() },
          { plan: plan(), review: review(status) },
        ],
        false,
      )[2]?.status,
    ).toBe(status);
  },
);
it('does not claim an approval limit when evidence is missing or unlimited', () => {
  expect(
    fundChecksFromReviews(
      [{ plan: plan(), review: review('passed', true) }],
      false,
    )[0]?.status,
  ).toBe('warning');
  expect(
    fundChecksFromReviews([{ plan: plan('12', 2), review: review() }], false)[0]
      ?.status,
  ).toBe('warning');
});
it.each(['0', '-1', '1.2', ''])(
  'does not invent a positive minimum for %s',
  (minimum) => {
    expect(
      fundChecksFromReviews(
        [{ plan: plan(minimum), review: review() }],
        false,
      )[1]?.status,
    ).toBe('unavailable');
  },
);
it('leaves checks unavailable before any review', () => {
  expect(fundChecksFromReviews([], false).map((row) => row.status)).toEqual([
    'unavailable',
    'unavailable',
    'unavailable',
  ]);
});
it('reads approvals for the reviewed strategy execution group and allocation minima', () => {
  const strategy = {
    kind: 'strategy',
    allocations: [{ toAmountMin: '14' }],
    executionGroups: [{ id: 'base', approvals: [{}] }],
  } as unknown as StrategyDepositPlan;
  expect(
    fundChecksFromReviews([{ plan: strategy, review: review() }], false)[1]
      ?.minimums,
  ).toEqual(['14']);
  expect(
    fundChecksFromReviews(
      [{ plan: { ...strategy, executionGroups: [] }, review: review() }],
      false,
    )[0]?.status,
  ).toBe('checked');
  expect(
    fundChecksFromReviews(
      [{ plan: plan('', 0), review: { ...review(), approvals: [] } }],
      false,
    )[0]?.status,
  ).toBe('checked');
});
