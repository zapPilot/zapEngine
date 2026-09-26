import {
  GmxDepositTooSmallError,
  HlpDepositTooSmallError,
} from '@zapengine/intent-engine';
import {
  type DepositPlan,
  GMX_DEPOSIT_TOO_SMALL_ERROR_CODE,
  HLP_DEPOSIT_TOO_SMALL_ERROR_CODE,
  type WithdrawPlan,
} from '@zapengine/types/api';
import { Hono } from 'hono';
import { encodeFunctionData, erc20Abi, maxUint256 } from 'viem';
import { describe, expect, it, vi } from 'vitest';

import { getErrorStatus, toErrorResponse } from '../../../src/common/http';
import { createPlanOrchestrationRoutes } from '../../../src/modules/plan-orchestration/route';
import {
  createPlanOrchestrationService,
  type PlanOrchestrationService,
  type PlanSimulationDeps,
} from '../../../src/modules/plan-orchestration/service';

const USER = '0x1111111111111111111111111111111111111111';
const ARBITRUM_USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const ETHEREUM_USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

const plan: DepositPlan = {
  legs: [],
  approvals: [],
  calls: [],
  totalGasUsd: '0',
  sourceChainId: 42161,
};

const withdrawPlan: WithdrawPlan = {
  legs: [],
  approvals: [],
  calls: [],
  totalGasUsd: '0',
  sourceChainId: 42161,
};

function createApp(
  service: PlanOrchestrationService = {
    buildDeposit: vi.fn().mockResolvedValue(plan),
    buildDepositReview: vi.fn(),
    buildWithdraw: vi.fn().mockResolvedValue(withdrawPlan),
    buildRotateReview: vi.fn(),
  },
) {
  const app = new Hono();
  app.route('/plan-orchestration', createPlanOrchestrationRoutes(service));
  app.onError((error, c) =>
    c.json(toErrorResponse(c.req.path, error), getErrorStatus(error) as never),
  );
  return { app, service };
}

describe('POST /plan-orchestration/deposit', () => {
  it('validates the GMX request and returns the DepositPlan response', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'gmx-v2',
          marketKey: 'eth-usdc',
          fromToken: ARBITRUM_USDC,
          amount: '1000',
          userAddress: USER,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(plan);
    expect(service.buildDeposit).toHaveBeenCalledWith({
      kind: 'gmx-v2',
      marketKey: 'eth-usdc',
      fromToken: ARBITRUM_USDC,
      amount: '1000',
      userAddress: USER,
    });
  });

  it('validates a chain-batch request and delegates it unchanged', async () => {
    const { app, service } = createApp();
    const body = {
      kind: 'chain-batch',
      userAddress: USER,
      sourceChainId: 42161,
      positions: [
        { kind: 'gmx-v2-basket', fromToken: ARBITRUM_USDC, amount: '35000000' },
        {
          kind: 'invest',
          fromToken: ARBITRUM_USDC,
          fromAmount: '25000000',
          split: { '1337': 1 },
        },
      ],
    };

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    expect(response.status).toBe(200);
    expect(service.buildDeposit).toHaveBeenCalledWith(body);
  });

  it('validates the Invest request and returns the DepositPlan response', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          fromAmount: '1000',
          sourceChainId: 8453,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(plan);
    expect(service.buildDeposit).toHaveBeenCalledWith({
      kind: 'invest',
      userAddress: USER,
      fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      fromAmount: '1000',
      sourceChainId: 8453,
    });
  });

  it('rejects a source-chain/token mismatch before service execution', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          // Base USDC is not a valid token on Ethereum mainnet
          fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          fromAmount: '1000',
          sourceChainId: 1,
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(service.buildDeposit).not.toHaveBeenCalled();
  });

  it('forwards an Invest split to the service', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          fromAmount: '1000',
          sourceChainId: 8453,
          split: { '8453': 0.7, '1337': 0.3 },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(service.buildDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ split: { '8453': 0.7, '1337': 0.3 } }),
    );
  });

  it('rejects a split with an unsupported chain before service execution', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          fromAmount: '1000',
          sourceChainId: 8453,
          split: { '8453': 0.5, '999': 0.5 },
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(service.buildDeposit).not.toHaveBeenCalled();
  });

  it('accepts an Arbitrum destination re-quote request', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          fromAmount: '990',
          sourceChainId: 42161,
          split: { '42161': 1 },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(service.buildDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ sourceChainId: 42161 }),
    );
  });

  it('accepts an Arbitrum USDC request that funds HyperCore', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          fromAmount: '25000000',
          sourceChainId: 42161,
          split: { '1337': 1 },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(service.buildDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ sourceChainId: 42161, split: { '1337': 1 } }),
    );
  });

  it('accepts an Ethereum USDC request that funds HyperCore', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          fromToken: ETHEREUM_USDC,
          fromAmount: '25000000',
          sourceChainId: 1,
          split: { '1337': 1 },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(service.buildDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ sourceChainId: 1, split: { '1337': 1 } }),
    );
  });

  it('rejects an Arbitrum source that bridges to Base', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          fromToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          fromAmount: '25000000',
          sourceChainId: 42161,
          split: { '42161': 0.5, '8453': 0.5 },
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(service.buildDeposit).not.toHaveBeenCalled();
  });

  it('rejects invalid request bodies before service execution', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'gmx-v2',
          marketKey: 'not-a-market',
          fromToken: ARBITRUM_USDC,
          amount: '1000',
          userAddress: USER,
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(service.buildDeposit).not.toHaveBeenCalled();
  });
});

describe('POST /plan-orchestration/deposit/review', () => {
  it('validates the request and delegates to the rich review service', async () => {
    const review = {
      plan,
      planFingerprint: `0x${'1'.repeat(64)}`,
      reviewedAt: 1_000,
      expiresAt: 301_000,
      reviews: {},
    };
    const service: PlanOrchestrationService = {
      buildDeposit: vi.fn().mockResolvedValue(plan),
      buildDepositReview: vi.fn().mockResolvedValue(review),
      buildWithdraw: vi.fn().mockResolvedValue(withdrawPlan),
      buildRotateReview: vi.fn(),
    };
    const { app } = createApp(service);

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit/review',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          fromAmount: '1000',
          sourceChainId: 8453,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(review);
    expect(service.buildDepositReview).toHaveBeenCalledWith({
      kind: 'invest',
      userAddress: USER,
      fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      fromAmount: '1000',
      sourceChainId: 8453,
    });
  });

  it('reviews an Ethereum USDC request that funds HyperCore', async () => {
    const service: PlanOrchestrationService = {
      buildDeposit: vi.fn().mockResolvedValue(plan),
      buildDepositReview: vi.fn().mockResolvedValue({
        plan,
        planFingerprint: `0x${'2'.repeat(64)}`,
        reviewedAt: 1_000,
        expiresAt: 301_000,
        reviews: {},
      }),
      buildWithdraw: vi.fn().mockResolvedValue(withdrawPlan),
      buildRotateReview: vi.fn(),
    };
    const { app } = createApp(service);

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit/review',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'invest',
          userAddress: USER,
          fromToken: ETHEREUM_USDC,
          fromAmount: '25000000',
          sourceChainId: 1,
          split: { '1337': 1 },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(service.buildDepositReview).toHaveBeenCalledWith(
      expect.objectContaining({ sourceChainId: 1, split: { '1337': 1 } }),
    );
  });

  it('answers a GMX leg too small to execute with 422 and its code', async () => {
    const message =
      'GMX v2 btc-btc deposit too small: swap output has no slippage buffer';
    const service: PlanOrchestrationService = {
      buildDeposit: vi.fn().mockResolvedValue(plan),
      buildDepositReview: vi
        .fn()
        .mockRejectedValue(new GmxDepositTooSmallError(message)),
      buildWithdraw: vi.fn().mockResolvedValue(withdrawPlan),
      buildRotateReview: vi.fn(),
    };
    const { app } = createApp(service);

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit/review',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'chain-batch',
          userAddress: USER,
          sourceChainId: 42161,
          positions: [
            { kind: 'gmx-v2-basket', fromToken: ARBITRUM_USDC, amount: '106' },
          ],
        }),
      },
    );

    // A client error the app can explain, not a 500 that reaches Sentry.
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      statusCode: 422,
      code: GMX_DEPOSIT_TOO_SMALL_ERROR_CODE,
      message,
    });
  });

  it('answers an HLP leg whose bridge output misses the vault minimum with 422 and its code', async () => {
    const message =
      'HLP allocation is below the vault minimum of 10000000 perp USDC base units (quoted 9904231)';
    const service: PlanOrchestrationService = {
      buildDeposit: vi.fn().mockResolvedValue(plan),
      buildDepositReview: vi
        .fn()
        .mockRejectedValue(new HlpDepositTooSmallError(message)),
      buildWithdraw: vi.fn().mockResolvedValue(withdrawPlan),
      buildRotateReview: vi.fn(),
    };
    const { app } = createApp(service);

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit/review',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'chain-batch',
          userAddress: USER,
          sourceChainId: 1,
          positions: [
            {
              kind: 'invest',
              fromToken: ETHEREUM_USDC,
              fromAmount: '10000000',
              split: { '1337': 1 },
            },
          ],
        }),
      },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      statusCode: 422,
      code: HLP_DEPOSIT_TOO_SMALL_ERROR_CODE,
      message,
    });
  });
});

describe('POST /plan-orchestration/withdraw', () => {
  it('validates the GMX withdraw request and returns the WithdrawPlan', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/withdraw',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'gmx-v2',
          marketKey: 'eth-usdc',
          gmAmount: '5000',
          userAddress: USER,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(withdrawPlan);
    expect(service.buildWithdraw).toHaveBeenCalledWith({
      kind: 'gmx-v2',
      marketKey: 'eth-usdc',
      gmAmount: '5000',
      userAddress: USER,
    });
  });

  it('validates the Morpho withdraw request with an optional toToken', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/withdraw',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'morpho',
          userAddress: USER,
          vaultAddress: '0x4444444444444444444444444444444444444444',
          shareAmount: '1000000000000000000',
          chainId: 8453,
          toToken: '0x5555555555555555555555555555555555555555',
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(service.buildWithdraw).toHaveBeenCalledWith({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: '0x4444444444444444444444444444444444444444',
      shareAmount: '1000000000000000000',
      chainId: 8453,
      toToken: '0x5555555555555555555555555555555555555555',
    });
  });

  it('rejects invalid withdraw bodies before service execution', async () => {
    const { app, service } = createApp();

    const response = await app.request(
      'http://localhost/plan-orchestration/withdraw',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'gmx-v2',
          marketKey: 'not-a-market',
          gmAmount: '5000',
          userAddress: USER,
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(service.buildWithdraw).not.toHaveBeenCalled();
  });
});

describe('POST /plan-orchestration/rotate/review', () => {
  const body = {
    userAddress: USER,
    chainId: 8453,
    fromVault: '0x4444444444444444444444444444444444444444',
    toVault: '0x5555555555555555555555555555555555555555',
    shareAmount: '100000000000000',
  };
  const post = (app: Hono, payload: unknown) =>
    app.request('http://localhost/plan-orchestration/rotate/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

  it('validates the rotation and returns the review', async () => {
    const review = { plan: { calls: [] } };
    const { app, service } = createApp();
    vi.mocked(service.buildRotateReview).mockResolvedValue(review as never);

    const response = await post(app, body);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(review);
    expect(service.buildRotateReview).toHaveBeenCalledWith(body);
  });

  it.each([
    ['the same vault on both sides', { toVault: body.fromVault }],
    ['zero shares', { shareAmount: '0' }],
    ['a malformed vault', { fromVault: '0x1234' }],
  ])('rejects %s before planning', async (_, override) => {
    const { app, service } = createApp();

    const response = await post(app, { ...body, ...override });

    expect(response.status).toBe(400);
    expect(service.buildRotateReview).not.toHaveBeenCalled();
  });
});

describe('plan safety gate', () => {
  const investBody = {
    kind: 'invest',
    userAddress: USER,
    fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    fromAmount: '1000',
    sourceChainId: 8453,
  };

  function investRequest() {
    return {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(investBody),
    };
  }

  function createGateApp(options: {
    composedPlan?: DepositPlan;
    simulation?: PlanSimulationDeps;
  }) {
    const service = createPlanOrchestrationService({
      adapter: {} as never,
      intentEngine: {} as never,
      publicClients: {},
      composeDeposit: vi
        .fn()
        .mockResolvedValue(options.composedPlan ?? plan) as never,
      ...(options.simulation ? { simulation: options.simulation } : {}),
    });
    return createApp(service);
  }

  it('maps a plan-safety violation to 400', async () => {
    const unlimitedApprove: DepositPlan = {
      ...plan,
      approvals: [
        {
          to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: ['0x2222222222222222222222222222222222222222', maxUint256],
          }),
          value: '0',
          chainId: 8453,
          meta: { intentType: 'ERC20_APPROVE' },
        },
      ],
    };
    const { app } = createGateApp({ composedPlan: unlimitedApprove });

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      investRequest(),
    );

    expect(response.status).toBe(400);
  });

  it('maps a failed bundle simulation to 422 in enforce mode', async () => {
    const simulateBundle = vi
      .fn()
      .mockResolvedValue({ status: 'failed', reason: 'reverted' });
    const { app } = createGateApp({
      simulation: { adapter: { simulateBundle } },
    });

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      investRequest(),
    );

    expect(response.status).toBe(422);
    expect(simulateBundle).toHaveBeenCalledWith(
      expect.objectContaining({ from: USER, chainId: plan.sourceChainId }),
    );
  });

  it('allows submission when bundle simulation is unavailable in enforce mode', async () => {
    const simulateBundle = vi
      .fn()
      .mockResolvedValue({ status: 'unavailable', reason: 'timeout' });
    const { app } = createGateApp({
      simulation: { adapter: { simulateBundle } },
    });

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      investRequest(),
    );

    expect(response.status).toBe(200);
    expect(simulateBundle).toHaveBeenCalled();
  });

  it('serves the plan when no simulation dependency is configured', async () => {
    const { app } = createGateApp({});

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      investRequest(),
    );

    expect(response.status).toBe(200);
  });
});
