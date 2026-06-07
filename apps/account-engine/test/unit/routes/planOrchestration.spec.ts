import type { DepositPlan, WithdrawPlan } from '@zapengine/types/api';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { getErrorStatus, toErrorResponse } from '../../../src/common/http';
import { createPlanOrchestrationRoutes } from '../../../src/modules/plan-orchestration/route';

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
  service = {
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

  it('rejects non-Base Invest requests before service execution', async () => {
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
          sourceChainId: 1,
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
