import { Router } from 'express';
import { z } from 'zod';
import { TokenPriceETLProcessor } from '../modules/token-price/index.js';
import type {
  BackfillPayload,
  BackfillResult,
} from '../types/index.js';
import { toErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/sleep.js';
import {
  type DmaRetryResult,
  buildApiErrorResponse,
  buildSuccessResponse,
  buildValidationErrorResponse,
  createDmaFailureOutcome,
  createProcessingFailureOutcome,
  createSuccessfulBackfillContext,
  createSuccessfulTokenOutcome,
  getRequestId,
} from './backfill.helpers.js';

const router: Router = Router();
const processor = new TokenPriceETLProcessor();
const DMA_MAX_RETRIES = 2;
const DMA_RETRY_DELAY_MS = 150;

// Zod schema for backfill validation
const tokenConfigSchema = z.object({
  tokenId: z.string().min(1),
  tokenSymbol: z.string().min(1).max(10),
  daysBack: z.number().positive().max(365).optional()
});

const backfillPayloadSchema = z.object({
  tokens: z.array(tokenConfigSchema).min(1).max(10),  // Max 10 tokens per request
  trigger: z.enum(['manual', 'scheduled'])
});
type TokenConfig = z.infer<typeof tokenConfigSchema>;

async function updateDmaWithRetry(
  tokenSymbol: string,
  tokenId: string,
  requestId: string,
): Promise<DmaRetryResult> {
  for (let retries = 0; retries <= DMA_MAX_RETRIES; retries += 1) {
    try {
      const dmaResult = await processor.updateDmaForToken(
        tokenSymbol,
        tokenId,
        `${requestId}:${tokenSymbol}:dma`
      );

      return {
        dmaAttempted: true,
        dmaUpserted: dmaResult.recordsInserted,
        dmaRetries: retries,
        dmaSuccess: true
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);

      if (retries >= DMA_MAX_RETRIES) {
        return {
          dmaAttempted: true,
          dmaUpserted: 0,
          dmaRetries: retries,
          dmaSuccess: false,
          dmaError: errorMessage
        };
      }

      const nextRetry = retries + 1;
      const delay = DMA_RETRY_DELAY_MS * nextRetry;

      logger.warn('DMA update failed, retrying', {
        requestId,
        tokenSymbol,
        tokenId,
        retries: nextRetry,
        delayMs: delay,
        error: errorMessage
      });

      await sleep(delay);
    }
  }

  /* c8 ignore start */
  return Promise.reject(new Error('DMA retry loop exhausted unexpectedly'));
  /* c8 ignore stop */
}

async function processTokenBackfill(
  tokenConfig: TokenConfig,
  requestId: string
): Promise<{ success: boolean; result: BackfillResult }> {
  const startTime = Date.now();
  const daysBack = tokenConfig.daysBack ?? 30;

  try {
    logger.info('Starting backfill', {
      requestId,
      tokenSymbol: tokenConfig.tokenSymbol,
      tokenId: tokenConfig.tokenId,
      daysBack
    });

    const result = await processor.backfillHistory(
      daysBack,
      tokenConfig.tokenId,
      tokenConfig.tokenSymbol
    );

    const dmaStatus = await updateDmaWithRetry(
      tokenConfig.tokenSymbol,
      tokenConfig.tokenId,
      requestId
    );

    const duration = Date.now() - startTime;
    const tokenResultData = createSuccessfulBackfillContext(tokenConfig, daysBack, result, duration, dmaStatus);

    if (!dmaStatus.dmaSuccess) {
      return createDmaFailureOutcome(
        tokenConfig,
        requestId,
        result,
        dmaStatus,
        tokenResultData,
        duration
      );
    }

    logger.info('Backfill completed', {
      requestId,
      tokenSymbol: tokenConfig.tokenSymbol,
      ...result,
      ...dmaStatus,
      duration
    });

    return createSuccessfulTokenOutcome(tokenResultData);
  } catch (error) {
    return createProcessingFailureOutcome(tokenConfig, requestId, daysBack, startTime, error);
  }
}

async function processBackfillTokens(
  tokens: TokenConfig[],
  requestId: string
): Promise<{ results: BackfillResult[]; successCount: number; failureCount: number }> {
  const results: BackfillResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const tokenConfig of tokens) {
    const tokenOutcome = await processTokenBackfill(tokenConfig, requestId);
    results.push(tokenOutcome.result);

    if (tokenOutcome.success) {
      successCount += 1;
    } else {
      failureCount += 1;
    }
  }

  return { results, successCount, failureCount };
}

router.post('/', async (req, res) => {
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    const payload: BackfillPayload = backfillPayloadSchema.parse(req.body);

    logger.info('Backfill request received', {
      requestId,
      trigger: payload.trigger,
      tokenCount: payload.tokens.length
    });

    const { results, successCount, failureCount } = await processBackfillTokens(payload.tokens, requestId);

    if (failureCount > 0 && successCount === 0) {
      return res.json(buildApiErrorResponse('All backfill requests failed'));
    }

    return res.json(buildSuccessResponse(results));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json(buildValidationErrorResponse(error));
    }

    logger.error('Backfill request failed:', { error, requestId });
    return res.status(500).json(buildApiErrorResponse(toErrorMessage(error)));
  }
});

export { router as backfillRouter };
