import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  parseDepositRequest: vi.fn((value: unknown) => ({
    parsedDepositRequest: value,
  })),
  parseReviewRequest: vi.fn((value: unknown) => ({
    parsedReviewRequest: value,
  })),
  parseWithdrawRequest: vi.fn((value: unknown) => ({
    parsedWithdrawRequest: value,
  })),
  parseDepositPlan: vi.fn((value: unknown) => ({
    kind: 'deposit-plan',
    value,
  })),
  parseHlpPlan: vi.fn((value: unknown) => ({ kind: 'hlp-plan', value })),
  parseStrategyPlan: vi.fn((value: unknown) => ({
    kind: 'strategy-plan',
    value,
  })),
  parseReviewResponse: vi.fn((value: unknown) => ({ kind: 'review', value })),
  parseWithdrawPlan: vi.fn((value: unknown) => ({
    kind: 'withdraw-plan',
    value,
  })),
}));

vi.mock('@core/lib/http', () => ({
  httpUtils: {
    accountApi: {
      post: mocks.post,
    },
  },
}));

vi.mock('@zapengine/types/api', () => ({
  PlanOrchestrationDepositRequestSchema: { parse: mocks.parseDepositRequest },
  PlanOrchestrationDepositReviewRequestSchema: {
    parse: mocks.parseReviewRequest,
  },
  PlanOrchestrationDepositReviewResponseSchema: {
    parse: mocks.parseReviewResponse,
  },
  PlanOrchestrationWithdrawRequestSchema: { parse: mocks.parseWithdrawRequest },
  DepositPlanSchema: { parse: mocks.parseDepositPlan },
  HlpSpotDepositPlanSchema: { parse: mocks.parseHlpPlan },
  StrategyDepositPlanSchema: { parse: mocks.parseStrategyPlan },
  WithdrawPlanSchema: { parse: mocks.parseWithdrawPlan },
}));

import {
  getDepositPlan,
  getDepositReview,
  getHlpSpotDepositPlan,
  getStrategyDepositPlan,
  getWithdrawPlan,
} from '@core/services/planOrchestrationService';

const REQUEST_CONFIG = { timeout: 60_000, retries: 0 };

describe('planOrchestrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({ wire: true });
  });

  it.each([
    ['deposit', getDepositPlan, mocks.parseDepositPlan],
    ['hlp-spot-deposit', getHlpSpotDepositPlan, mocks.parseHlpPlan],
    ['strategy', getStrategyDepositPlan, mocks.parseStrategyPlan],
  ] as const)(
    'posts and validates the %s deposit plan',
    async (kind, fn, parser) => {
      const request = { kind, userId: 'user-1' } as never;

      await fn(request);

      expect(mocks.parseDepositRequest).toHaveBeenCalledWith(request);
      expect(mocks.post).toHaveBeenCalledWith(
        '/plan-orchestration/deposit',
        { parsedDepositRequest: request },
        REQUEST_CONFIG,
      );
      expect(parser).toHaveBeenCalledWith({ wire: true });
    },
  );

  it('posts and validates the deposit review', async () => {
    const request = { kind: 'deposit', userId: 'user-1' } as never;

    await expect(getDepositReview(request)).resolves.toEqual({
      kind: 'review',
      value: { wire: true },
    });

    expect(mocks.parseReviewRequest).toHaveBeenCalledWith(request);
    expect(mocks.post).toHaveBeenCalledWith(
      '/plan-orchestration/deposit/review',
      { parsedReviewRequest: request },
      REQUEST_CONFIG,
    );
    expect(mocks.parseReviewResponse).toHaveBeenCalledWith({ wire: true });
  });

  it('posts and validates the withdraw plan', async () => {
    const request = { kind: 'withdraw', userId: 'user-1' } as never;

    await expect(getWithdrawPlan(request)).resolves.toEqual({
      kind: 'withdraw-plan',
      value: { wire: true },
    });

    expect(mocks.parseWithdrawRequest).toHaveBeenCalledWith(request);
    expect(mocks.post).toHaveBeenCalledWith(
      '/plan-orchestration/withdraw',
      { parsedWithdrawRequest: request },
      REQUEST_CONFIG,
    );
    expect(mocks.parseWithdrawPlan).toHaveBeenCalledWith({ wire: true });
  });
});
