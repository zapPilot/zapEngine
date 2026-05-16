import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  getErrorStatus,
  HttpStatus,
  toErrorResponse,
} from '../../../src/common/http';
import type { AppServices } from '../../../src/container';
import { createDepositRoutes } from '../../../src/routes/deposit';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function createServices(): AppServices {
  return {
    depositPlanService: {
      build: vi.fn().mockResolvedValue({
        legs: [],
        approvals: [],
        calls: [],
        totalGasUsd: '0',
        sourceChainId: 8453,
      }),
    },
  } as unknown as AppServices;
}

function createApp(services: AppServices) {
  const app = new Hono();
  app.route('/users', createDepositRoutes(services));
  app.onError((error, c) =>
    c.json(toErrorResponse(c.req.path, error), getErrorStatus(error) as never),
  );
  return app;
}

describe('POST /users/:userId/deposit-plan', () => {
  it('validates the body and returns the generated deposit plan', async () => {
    const services = createServices();

    const response = await createApp(services).request(
      `http://localhost/users/${USER}/deposit-plan`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userAddress: USER,
          fromToken: BASE_USDC,
          fromAmount: '10000',
          sourceChainId: 8453,
        }),
      },
    );

    expect(response.status).toBe(HttpStatus.OK);
    expect(await response.json()).toEqual({
      legs: [],
      approvals: [],
      calls: [],
      totalGasUsd: '0',
      sourceChainId: 8453,
    });
    expect(services.depositPlanService.build).toHaveBeenCalledWith(USER, {
      userAddress: USER,
      fromToken: BASE_USDC,
      fromAmount: '10000',
      sourceChainId: 8453,
    });
  });

  it('rejects unsupported v1 tokens before service execution', async () => {
    const services = createServices();

    const response = await createApp(services).request(
      `http://localhost/users/${USER}/deposit-plan`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userAddress: USER,
          fromToken: '0x9999999999999999999999999999999999999999',
          fromAmount: '10000',
          sourceChainId: 8453,
        }),
      },
    );

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    expect(services.depositPlanService.build).not.toHaveBeenCalled();
  });
});
