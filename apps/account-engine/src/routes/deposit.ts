import {
  type DepositRequest,
  DepositRequestSchema,
} from '@zapengine/types/api';
import { Hono } from 'hono';

import { HttpStatus } from '../common/http';
import type { AppServices } from '../container';
import { jsonResponse, jsonValidator } from './shared';

export function createDepositRoutes(services: AppServices) {
  const app = new Hono();

  app.post(
    '/:userId/deposit-plan',
    jsonValidator(DepositRequestSchema),
    async (c) => {
      const body = c.req.valid('json') as DepositRequest;
      const plan = await services.depositPlanService.build(
        c.req.param('userId'),
        body,
      );

      return jsonResponse(c, plan, HttpStatus.OK);
    },
  );

  return app;
}
