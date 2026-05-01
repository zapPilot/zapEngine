import { Router } from 'express';
import { z } from 'zod';

import { etlJobQueue } from '../modules/core/jobQueueSingleton.js';
import type { ETLJobTask } from '../types/index.js';
import { buildSuccessApiResponse } from '../utils/apiResponse.js';
import { toErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  buildApiErrorResponse,
  buildValidationErrorResponse,
  getRequestId,
} from './backfill.helpers.js';

const router: Router = Router();

const tokenConfigSchema = z.object({
  tokenId: z.string().min(1),
  tokenSymbol: z.string().min(1).max(10),
  daysBack: z.number().positive().max(365).optional(),
});

const backfillPayloadSchema = z.object({
  tokens: z.array(tokenConfigSchema).min(1).max(10),
  trigger: z.unknown().optional(),
});

const macroFearGreedBackfillPayloadSchema = z.object({
  trigger: z.unknown().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default('2021-01-01'),
});

async function enqueueBackfillTask(
  task: ETLJobTask,
  requestId: string,
): Promise<string> {
  const job = await etlJobQueue.enqueue({
    sources: [task.source],
    tasks: [task],
  });

  logger.info('Backfill compatibility request queued', {
    requestId,
    jobId: job.jobId,
    source: task.source,
  });

  return job.jobId;
}

router.post('/', async (req, res) => {
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    const payload = backfillPayloadSchema.parse(req.body);
    const jobId = await enqueueBackfillTask(
      {
        source: 'token-price',
        operation: 'backfill',
        tokens: payload.tokens,
      },
      requestId,
    );

    return res.status(202).json(buildSuccessApiResponse({ jobId }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(buildValidationErrorResponse(error));
    }

    logger.error('Backfill request failed:', { error, requestId });
    return res.status(500).json(buildApiErrorResponse(toErrorMessage(error)));
  }
});

router.post('/macro-fear-greed', async (req, res) => {
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    const payload = macroFearGreedBackfillPayloadSchema.parse(req.body);
    const jobId = await enqueueBackfillTask(
      {
        source: 'macro-fear-greed',
        operation: 'backfill',
        startDate: payload.startDate,
      },
      requestId,
    );

    return res.status(202).json(buildSuccessApiResponse({ jobId }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(buildValidationErrorResponse(error));
    }

    logger.error('Macro Fear & Greed backfill request failed:', {
      error,
      requestId,
    });
    return res.status(500).json(buildApiErrorResponse(toErrorMessage(error)));
  }
});

export { router as backfillRouter };
