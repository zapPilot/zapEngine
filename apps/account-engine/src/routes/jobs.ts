import { Hono } from 'hono';

import { JOB_CONFIG } from '../common/constants';
import { requireApiKey } from '../common/guards';
import { HttpStatus, NotFoundException, toErrorResponse } from '../common/http';
import type { AppServices } from '../container';
import { Job, JobType } from '../modules/jobs/interfaces/job.interface';
import { jsonResponse, jsonValidator, paramValidator } from './shared';
import {
  dailySuggestionBatchBodySchema,
  jobIdParamSchema,
  singleUserReportBodySchema,
} from './validators';

export function createJobsRoutes(services: AppServices) {
  const app = new Hono();
  const requireAdminApiKey = requireApiKey(services.env);

  app.post('/weekly-report/batch', requireAdminApiKey, (c) => {
    const job = services.jobQueueService.createJob({
      type: JobType.WEEKLY_REPORT_BATCH,
      payload: {},
    });

    return c.json(
      {
        job: mapJobToResponse(job),
        message: 'Weekly report batch job created successfully.',
      },
      { status: HttpStatus.ACCEPTED },
    );
  });

  app.post(
    '/weekly-report/single-user',
    requireAdminApiKey,
    jsonValidator(singleUserReportBodySchema),
    (c) => {
      const body = c.req.valid('json');

      if (body.testMode && !body.testRecipient) {
        return jsonResponse(
          c,
          toErrorResponse(c.req.path, {
            message: 'testRecipient is required when testMode is enabled',
            statusCode: HttpStatus.BAD_REQUEST,
          }),
          HttpStatus.BAD_REQUEST,
        );
      }

      const job = services.jobQueueService.createJob({
        type: JobType.WEEKLY_REPORT_SINGLE,
        payload: {
          userId: body.userId,
          testMode: body.testMode ?? false,
          testRecipient: body.testRecipient,
          note: body.note,
        },
        priority: 1,
        maxRetries: JOB_CONFIG.FANOUT_MAX_RETRIES,
        retryDelaySeconds: JOB_CONFIG.FANOUT_RETRY_DELAY_SECONDS,
      });

      return jsonResponse(
        c,
        {
          job: mapJobToResponse(job),
          message: `Weekly report job created successfully for user ${body.userId}.`,
        },
        HttpStatus.ACCEPTED,
      );
    },
  );

  app.post(
    '/daily-suggestion/batch',
    requireAdminApiKey,
    async (c, next) => {
      if (c.req.raw.body === null) {
        return jsonResponse(
          c,
          toErrorResponse(c.req.path, {
            message: 'userIds is required',
            statusCode: HttpStatus.BAD_REQUEST,
          }),
          HttpStatus.BAD_REQUEST,
        );
      }
      await next();
    },
    jsonValidator(dailySuggestionBatchBodySchema),
    (c) => {
      const body = c.req.valid('json');
      const job = services.jobQueueService.createJob({
        type: JobType.DAILY_SUGGESTION_BATCH,
        payload: { userIds: body.userIds },
      });
      return jsonResponse(
        c,
        {
          job: mapJobToResponse(job),
          message: `Daily suggestion batch job created for ${body.userIds.length} user(s).`,
        },
        HttpStatus.ACCEPTED,
      );
    },
  );

  // No body: the notification describes the strategy, so there is nothing to
  // scope it to. Recipients are every Telegram-connected user.
  app.post('/strategy-change/batch', requireAdminApiKey, (c) => {
    const job = services.jobQueueService.createJob({
      type: JobType.STRATEGY_CHANGE_BATCH,
      payload: {},
    });

    return jsonResponse(
      c,
      {
        job: mapJobToResponse(job),
        message: 'Strategy change check job created successfully.',
      },
      HttpStatus.ACCEPTED,
    );
  });

  app.post(
    '/maintenance/telegram-token-cleanup',
    requireAdminApiKey,
    async (c) => {
      const deletedCount =
        await services.telegramTokenService.cleanupExpiredTokens();

      return jsonResponse(
        c,
        {
          deletedCount,
          message: `Cleaned up ${deletedCount} expired Telegram token(s).`,
        },
        HttpStatus.OK,
      );
    },
  );

  app.get('/:jobId', paramValidator(jobIdParamSchema), (c) => {
    const params = c.req.valid('param');
    const result = services.jobQueueService.getJobWithAggregatedStatus(
      params.jobId,
    );

    if (!result) {
      throw new NotFoundException(`Job with ID ${params.jobId} not found`);
    }

    return jsonResponse(
      c,
      mapJobToResponse(result.job, result.progress),
      HttpStatus.OK,
    );
  });

  return app;
}

function mapJobToResponse(
  job: Job,
  progress?: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  },
) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    payload: job.payload,
    priority: job.priority,
    maxRetries: job.maxRetries,
    retryCount: job.retryCount,
    retryDelaySeconds: job.retryDelaySeconds,
    scheduledAt: job.scheduledAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    errorMessage: job.errorMessage,
    metadata: job.metadata,
    progress,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
