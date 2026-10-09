import type {
  DepositReviewGroup,
  ReviewedDepositPlan,
} from '@zapengine/types/api';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';
export type FundCheckStatus =
  | 'checked'
  | 'warning'
  | 'failed'
  | 'unavailable'
  | 'not-simulated';
export interface FundCheck {
  id: 'approvals' | 'minimum' | 'simulation' | 'hypercore';
  status: FundCheckStatus;
  minimums?: readonly string[];
}
export function fundChecksFromReviews(
  batches: readonly { plan: ReviewedDepositPlan; review: DepositReviewGroup }[],
  hasHyperCore: boolean,
): FundCheck[] {
  const reviews = batches.map((batch) => batch.review);
  const plannedApprovals = batches.reduce(
    (sum, batch) =>
      sum +
      (isStrategyDepositPlan(batch.plan)
        ? (batch.plan.executionGroups.find(
            (group) => group.id === batch.review.groupId,
          )?.approvals.length ?? 0)
        : batch.plan.approvals.length),
    0,
  );
  const approvals = reviews.flatMap((review) => review.approvals);
  const minimums = batches.flatMap((batch) =>
    isStrategyDepositPlan(batch.plan)
      ? batch.plan.allocations.map((allocation) => allocation.toAmountMin)
      : batch.plan.legs.map((leg) => leg.toAmountMin),
  );
  const bounded =
    approvals.length >= plannedApprovals &&
    approvals.every((approval) => !approval.unlimited);
  const positiveMinimums =
    minimums.length > 0 &&
    minimums.every((value) => /^\d+$/.test(value) && BigInt(value) > 0n);
  const simulation: FundCheckStatus = reviews.some(
    (review) => review.status === 'failed',
  )
    ? 'failed'
    : reviews.length === 0 ||
        reviews.some((review) => review.status === 'unavailable')
      ? 'unavailable'
      : reviews.some((review) => review.status === 'warning')
        ? 'warning'
        : 'checked';
  const rows: FundCheck[] = [
    {
      id: 'approvals',
      status:
        reviews.length === 0 ? 'unavailable' : bounded ? 'checked' : 'warning',
    },
    {
      id: 'minimum',
      status: positiveMinimums ? 'checked' : 'unavailable',
      minimums,
    },
    { id: 'simulation', status: simulation },
  ];
  if (hasHyperCore) rows.push({ id: 'hypercore', status: 'not-simulated' });
  return rows;
}
