import type { DepositPlan, WithdrawPlan } from '@zapengine/types/api';
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
    buildWithdraw: vi.fn().mockResolvedValue(withdrawPlan),
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
      amount: '1000',
      userAddress: USER,
    });
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
          amount: '1000',
          userAddress: USER,
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(service.buildDeposit).not.toHaveBeenCalled();
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
      simulation: { adapter: { simulateBundle }, mode: 'enforce' },
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

  it('maps an unavailable bundle simulation to 503 in enforce mode', async () => {
    const simulateBundle = vi
      .fn()
      .mockResolvedValue({ status: 'unavailable', reason: 'timeout' });
    const { app } = createGateApp({
      simulation: { adapter: { simulateBundle }, mode: 'enforce' },
    });

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      investRequest(),
    );

    expect(response.status).toBe(503);
  });

  it('does not call the simulation adapter in off mode', async () => {
    const simulateBundle = vi.fn();
    const { app } = createGateApp({
      simulation: { adapter: { simulateBundle }, mode: 'off' },
    });

    const response = await app.request(
      'http://localhost/plan-orchestration/deposit',
      investRequest(),
    );

    expect(response.status).toBe(200);
    expect(simulateBundle).not.toHaveBeenCalled();
  });
});
