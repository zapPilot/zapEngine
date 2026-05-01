import { Router } from 'express';
import { z } from 'zod';

import { etlJobQueue } from '../modules/core/jobQueueSingleton.js';
import type { ETLJob } from '../types/index.js';
import {
  buildErrorApiResponse,
  buildSuccessApiResponse,
  buildWebhookErrorApiResponse,
  getRequestId,
} from '../utils/apiResponse.js';
import { toErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { maskWalletAddress } from '../utils/mask.js';
import {
  buildJobStatusApiResponse,
  buildJobStatusResponse,
  determineJobStatusCode,
  validateJobStatusResponse,
} from './webhooks.responses.js';
import { walletFetchSchema, webhookPayloadSchema } from './webhooks.schemas.js';

const router: Router = Router();

type QueueParams = Pick<ETLJob, 'sources' | 'tasks' | 'filters' | 'metadata'>;

async function enqueueJob(
  params: QueueParams,
  requestId: string,
): Promise<ETLJob> {
  const job = await etlJobQueue.enqueue(params);

  logger.info('ETL job queued successfully', {
    requestId,
    jobId: job.jobId,
    sources: params.sources,
  });

  return job;
}

function buildValidationResponse(error: z.ZodError, requestId: string) {
  return buildWebhookErrorApiResponse(
    'VALIDATION_ERROR',
    error.message,
    requestId,
    { errors: error.issues },
  );
}

router.post('/jobs', async (req, res) => {
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    const payload = webhookPayloadSchema.parse(req.body ?? {});

    logger.info('ETL job request received', {
      requestId,
      sources: payload.sources,
      taskCount: payload.tasks.length,
    });

    const job = await enqueueJob(
      {
        sources: payload.sources,
        tasks: payload.tasks,
        filters: payload.filters,
      },
      requestId,
    );

    return res.status(202).json(buildSuccessApiResponse({ jobId: job.jobId }));
  } catch (error) {
    logger.error('ETL job request failed:', { error, requestId });

    if (error instanceof z.ZodError) {
      return res.status(400).json(buildValidationResponse(error, requestId));
    }

    const response = buildWebhookErrorApiResponse(
      'API_ERROR',
      toErrorMessage(error),
      requestId,
    );

    return res.status(500).json(response);
  }
});

router.post('/pipedream', async (req, res) => {
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    const payload = webhookPayloadSchema.parse(req.body ?? {});

    logger.info('Pipedream compatibility webhook received', {
      requestId,
      sources: payload.sources,
      taskCount: payload.tasks.length,
    });

    const job = await enqueueJob(
      {
        sources: payload.sources,
        tasks: payload.tasks,
        filters: payload.filters,
      },
      requestId,
    );

    return res.status(202).json(buildSuccessApiResponse({ jobId: job.jobId }));
  } catch (error) {
    logger.error('Pipedream webhook processing failed:', { error, requestId });

    if (error instanceof z.ZodError) {
      return res.status(400).json(buildValidationResponse(error, requestId));
    }

    const response = buildWebhookErrorApiResponse(
      'API_ERROR',
      toErrorMessage(error),
      requestId,
    );

    return res.status(500).json(response);
  }
});

/**
 * POST /webhooks/wallet-fetch
 * Trigger on-demand wallet data fetch from account-engine
 *
 * This endpoint is called by account-engine when a user connects a new wallet
 * or manually refreshes their portfolio data. Unlike the Pipedream webhook
 * (which batch-processes VIP users), this endpoint processes a single wallet
 * address and returns immediately with a jobId for status tracking.
 */
router.post('/wallet-fetch', async (req, res) => {
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    const payload = walletFetchSchema.parse(req.body);

    // Validate webhook secret if configured
    const webhookSecret = process.env['WEBHOOK_SECRET'];
    if (
      webhookSecret &&
      (!payload.secret || payload.secret !== webhookSecret)
    ) {
      logger.warn('Invalid webhook secret', {
        requestId,
        userId: payload.userId,
        wallet: maskWalletAddress(payload.walletAddress),
      });
      return res
        .status(401)
        .json(
          buildWebhookErrorApiResponse(
            'UNAUTHORIZED',
            'Invalid webhook secret',
            requestId,
          ),
        );
    }

    logger.info('Wallet fetch webhook received', {
      requestId,
      userId: payload.userId,
      walletAddress: maskWalletAddress(payload.walletAddress),
    });

    // Enqueue job with metadata for single wallet processing
    const job = await enqueueJob(
      {
        sources: ['debank'],
        metadata: {
          userId: payload.userId,
          walletAddress: payload.walletAddress,
          jobType: 'wallet_fetch',
        },
      },
      requestId,
    );

    logger.info('Wallet fetch job queued successfully', {
      requestId,
      jobId: job.jobId,
      userId: payload.userId,
      walletAddress: maskWalletAddress(payload.walletAddress),
    });

    return res.status(202).json(buildSuccessApiResponse({ jobId: job.jobId }));
  } catch (error) {
    logger.error('Wallet fetch webhook processing failed:', {
      error,
      requestId,
    });

    if (error instanceof z.ZodError) {
      const response = buildWebhookErrorApiResponse(
        'VALIDATION_ERROR',
        'Invalid wallet fetch payload',
        requestId,
        { errors: error.issues },
      );
      return res.status(400).json(response);
    }

    const response = buildWebhookErrorApiResponse(
      'API_ERROR',
      toErrorMessage(error),
      requestId,
    );

    return res.status(500).json(response);
  }
});

router.get('/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    const job = etlJobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json(
        buildErrorApiResponse({
          code: 'API_ERROR',
          message: 'Job not found',
          source: 'system',
        }),
      );
    }

    const result = etlJobQueue.getResult(jobId);

    logger.info('Job status requested', {
      requestId,
      jobId,
      status: job.status,
      hasResult: !!result,
    });

    const response = buildJobStatusResponse(job, result);
    const { validated, validationError } = validateJobStatusResponse(response);

    if (validationError) {
      logger.warn('Job status schema validation failed', {
        jobId,
        error: validationError,
      });
    }

    const statusCode = determineJobStatusCode(job, response, result);
    const apiResponse = buildJobStatusApiResponse(
      statusCode,
      validated,
      response.error,
    );

    return res.status(statusCode).json(apiResponse);
  } catch (error) {
    logger.error('Job status retrieval failed:', { error, requestId, jobId });

    return res.status(500).json(
      buildErrorApiResponse({
        code: 'API_ERROR',
        message: 'Failed to retrieve job status',
        source: 'system',
      }),
    );
  }
});

export { router as webhooksRouter };
