import { type Request, type Response, Router } from 'express';

import { getHealthState } from '../modules/core/healthStatus.js';
import type { HealthCheckResponse } from '../types/index.js';
import { logger } from '../utils/logger.js';

function buildHealthResponse(cachedState: ReturnType<typeof getHealthState>): {
  response: HealthCheckResponse;
  isHealthy: boolean;
} {
  const isHealthy = cachedState.status === 'healthy';
  const status = isHealthy ? 'healthy' : 'unhealthy';
  const now = new Date().toISOString();

  return {
    isHealthy,
    response: {
      success: true,
      data: {
        status,
        timestamp: now,
        version: '1.0.0',
        uptime: process.uptime(),
        cached: cachedState.status !== 'initializing',
        lastCheckedAt: cachedState.lastCheckedAt,
        ...(cachedState.message !== undefined && {
          message: cachedState.message,
        }),
      },
      timestamp: now,
    },
  };
}

const router: Router = Router();

router.get('/', (req: Request, res: Response) => {
  const startTime = Date.now();
  const cachedState = getHealthState();
  const responseTime = Date.now() - startTime;
  const { response, isHealthy } = buildHealthResponse(cachedState);

  if (isHealthy) {
    logger.info('Health check served healthy state from cache', {
      responseTime,
      lastCheckedAt: cachedState.lastCheckedAt,
    });
    return res.json(response);
  }

  if (cachedState.status === 'initializing') {
    logger.info('Health check requested during initialization window', {
      responseTime,
    });
  } else {
    logger.warn('Health check served unhealthy state from cache', {
      responseTime,
      lastCheckedAt: cachedState.lastCheckedAt,
      message: cachedState.message,
    });
  }

  return res.status(503).json(response);
});

export { router as healthRouter };
