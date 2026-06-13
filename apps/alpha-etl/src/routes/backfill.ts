import { type Request, type Response, Router } from 'express';
import { z } from 'zod';

import { etlJobQueue } from '../modules/core/jobQueueSingleton.js';
import type { ETLJobTask } from '../types/index.js';
import {
  buildSuccessApiResponse,
  buildSystemErrorApiResponse,
  buildValidationErrorApiResponse,
  getRequestId,
} from '../utils/apiResponse.js';
import { toErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { tokenConfigSchema } from './webhooks.schemas.js';

const router: Router = Router();

const backfillPayloadSchema = z.object({
  tokens: z.array(tokenConfigSchema).min(1).max(10),
});

const macroFearGreedBackfillPayloadSchema = z.object({
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

async function handleBackfillRequest<TPayload>(
  req: Request,
  res: Response,
  schema: z.ZodType<TPayload>,
  buildTask: (payload: TPayload) => ETLJobTask,
  failureMessage: string,
) {
  const requestId = getRequestId(req.headers);

  try {
    const payload = schema.parse(req.body);
    const jobId = await enqueueBackfillTask(buildTask(payload), requestId);

    return res.status(202).json(buildSuccessApiResponse({ jobId }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(buildValidationErrorApiResponse(error));
    }

    logger.error(failureMessage, { error, requestId });
    return res
      .status(500)
      .json(buildSystemErrorApiResponse(toErrorMessage(error)));
  }
}

router.post('/', async (req, res) => {
  return handleBackfillRequest(
    req,
    res,
    backfillPayloadSchema,
    (payload) => ({
      source: 'token-price',
      operation: 'backfill',
      tokens: payload.tokens,
    }),
    'Backfill request failed:',
  );
});

router.post('/macro-fear-greed', async (req, res) => {
  return handleBackfillRequest(
    req,
    res,
    macroFearGreedBackfillPayloadSchema,
    (payload) => ({
      source: 'macro-fear-greed',
      operation: 'backfill',
      startDate: payload.startDate,
    }),
    'Macro Fear & Greed backfill request failed:',
  );
});

export { router as backfillRouter };
