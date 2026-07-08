import { zValidator } from '@hono/zod-validator';
import { PlanSafetyViolationError } from '@zapengine/intent-engine';
import {
  PlanOrchestrationDepositRequestSchema,
  PlanOrchestrationWithdrawRequestSchema,
} from '@zapengine/types/api';
import { type Context, Hono } from 'hono';

import {
  PlanSimulationFailedError,
  PlanSimulationUnavailableError,
} from './errors';
import type { PlanOrchestrationService } from './service';

// Service errors stay framework-free (module CLAUDE.md); this is the only
// place they gain HTTP meaning. Fail-closed mapping (ADR 0002 A5): a plan
// violating safety invariants is a bad request (400), a plan whose
// simulation reverts is unprocessable (422), and a simulation outage refuses
// service (503) rather than shipping an unsimulated plan.
function mapPlanError(
  error: unknown,
): { statusCode: number; message: string } | undefined {
  if (error instanceof PlanSafetyViolationError) {
    return { statusCode: 400, message: error.message };
  }
  if (error instanceof PlanSimulationFailedError) {
    return { statusCode: 422, message: error.message };
  }
  if (error instanceof PlanSimulationUnavailableError) {
    return { statusCode: 503, message: error.message };
  }
  return undefined;
}

async function handlePlanRequest<T>(
  c: Context,
  build: () => Promise<T>,
): Promise<Response> {
  try {
    const plan = await build();
    return c.json(plan, { status: 200 });
  } catch (error) {
    const mapped = mapPlanError(error);
    if (!mapped) {
      throw error;
    }
    return c.json(mapped, mapped.statusCode as never);
  }
}

export function createPlanOrchestrationRoutes(
  service: PlanOrchestrationService,
) {
  const app = new Hono();

  app.post(
    '/deposit',
    zValidator('json', PlanOrchestrationDepositRequestSchema),
    (c) => {
      const body = c.req.valid('json');
      return handlePlanRequest(c, () => service.buildDeposit(body));
    },
  );

  app.post(
    '/withdraw',
    zValidator('json', PlanOrchestrationWithdrawRequestSchema),
    (c) => {
      const body = c.req.valid('json');
      return handlePlanRequest(c, () => service.buildWithdraw(body));
    },
  );

  return app;
}
