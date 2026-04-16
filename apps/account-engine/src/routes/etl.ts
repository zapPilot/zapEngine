import { HttpStatus } from '@common/http';
import type { AppServices } from '@container';
import { Hono } from 'hono';

import { jsonResponse, paramValidator } from './shared';
import { type JobIdParam, jobIdParamSchema } from './validators';

export function createEtlRoutes(services: AppServices) {
  const app = new Hono();

  app.get('/jobs/:jobId', paramValidator(jobIdParamSchema), async (c) => {
    const params = c.req.valid('param') as JobIdParam;
    const response = await services.usersService.getEtlJobStatus(params.jobId);
    return jsonResponse(c, response, HttpStatus.OK);
  });

  return app;
}
