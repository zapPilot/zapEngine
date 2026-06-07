import { zValidator } from '@hono/zod-validator';
import {
  PlanOrchestrationDepositRequestSchema,
  PlanOrchestrationWithdrawRequestSchema,
} from '@zapengine/types/api';
import { Hono } from 'hono';

import type { PlanOrchestrationService } from './service';

export function createPlanOrchestrationRoutes(
  service: PlanOrchestrationService,
) {
  const app = new Hono();

  app.post(
    '/deposit',
    zValidator('json', PlanOrchestrationDepositRequestSchema),
    async (c) => {
      const body = c.req.valid('json');
      const plan = await service.buildDeposit(body);

      return c.json(plan, { status: 200 });
    },
  );

  app.post(
    '/withdraw',
    zValidator('json', PlanOrchestrationWithdrawRequestSchema),
    async (c) => {
      const body = c.req.valid('json');
      const plan = await service.buildWithdraw(body);

      return c.json(plan, { status: 200 });
    },
  );

  return app;
}
