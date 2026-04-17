import { toErrorMessage } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import {
  buildSuccessApiResponse,
  buildValidationErrorApiResponse,
  buildSystemErrorApiResponse,
} from "../utils/apiResponse.js";
import type {
  ApiResponse,
  BackfillResult,
  BackfillTokenResultData,
} from "../types/index.js";

interface BackfillTokenConfig {
  tokenId: string;
  tokenSymbol: string;
  daysBack?: number;
}

export type DmaRetryResult =
  | {
      dmaAttempted: true;
      dmaUpserted: number;
      dmaRetries: number;
      dmaSuccess: true;
    }
  | {
      dmaAttempted: true;
      dmaUpserted: 0;
      dmaRetries: number;
      dmaSuccess: false;
      dmaError: string;
    };

function buildBackfillFailureResult(
  tokenId: string,
  errorMessage: string,
  context?: Partial<BackfillTokenResultData>,
): BackfillResult {
  return {
    success: false,
    error: {
      code: "API_ERROR",
      message: errorMessage,
      source: "system",
      context: {
        tokenId,
        ...context,
      },
    },
  };
}

export { getRequestId } from "../utils/apiResponse.js";

export function buildSuccessResponse(
  results: BackfillResult[],
): ApiResponse<{ results: BackfillResult[] }> {
  return buildSuccessApiResponse({ results });
}

export const buildValidationErrorResponse = buildValidationErrorApiResponse;
export const buildApiErrorResponse = buildSystemErrorApiResponse;

function createFailedBackfillContext(
  tokenConfig: BackfillTokenConfig,
  daysBack: number,
  duration: number,
): BackfillTokenResultData {
  return {
    tokenSymbol: tokenConfig.tokenSymbol,
    tokenId: tokenConfig.tokenId,
    requested: daysBack,
    existing: 0,
    fetched: 0,
    inserted: 0,
    duration,
    dmaAttempted: false,
    dmaUpserted: 0,
    dmaRetries: 0,
    dmaSuccess: false,
    dmaError: "Backfill failed before DMA step",
  };
}

export function createSuccessfulBackfillContext(
  tokenConfig: BackfillTokenConfig,
  daysBack: number,
  result: {
    existing: number;
    fetched: number;
    inserted: number;
  },
  duration: number,
  dmaStatus: DmaRetryResult,
): BackfillTokenResultData {
  return {
    tokenSymbol: tokenConfig.tokenSymbol,
    tokenId: tokenConfig.tokenId,
    requested: daysBack,
    existing: result.existing,
    fetched: result.fetched,
    inserted: result.inserted,
    duration,
    ...dmaStatus,
  };
}

export function createDmaFailureOutcome(
  tokenConfig: BackfillTokenConfig,
  requestId: string,
  result: {
    existing: number;
    fetched: number;
    inserted: number;
  },
  dmaStatus: Extract<DmaRetryResult, { dmaSuccess: false }>,
  tokenResultData: BackfillTokenResultData,
  duration: number,
): { success: boolean; result: BackfillResult } {
  logger.error("Backfill completed but DMA update failed", {
    requestId,
    tokenSymbol: tokenConfig.tokenSymbol,
    tokenId: tokenConfig.tokenId,
    ...result,
    ...dmaStatus,
    duration,
  });

  return {
    success: false,
    result: buildBackfillFailureResult(
      tokenConfig.tokenId,
      `DMA update failed for ${tokenConfig.tokenSymbol} after ${dmaStatus.dmaRetries} retries: ${dmaStatus.dmaError}`,
      tokenResultData,
    ),
  };
}

export function createProcessingFailureOutcome(
  tokenConfig: BackfillTokenConfig,
  requestId: string,
  daysBack: number,
  startTime: number,
  error: unknown,
): { success: boolean; result: BackfillResult } {
  const duration = Date.now() - startTime;
  const errorMessage = toErrorMessage(error);

  logger.error("Backfill failed", {
    error,
    requestId,
    tokenSymbol: tokenConfig.tokenSymbol,
    duration,
  });

  return {
    success: false,
    result: buildBackfillFailureResult(
      tokenConfig.tokenId,
      errorMessage,
      createFailedBackfillContext(tokenConfig, daysBack, duration),
    ),
  };
}

export function createSuccessfulTokenOutcome(
  tokenResultData: BackfillTokenResultData,
): { success: boolean; result: BackfillResult } {
  return {
    success: true,
    result: { success: true, data: tokenResultData },
  };
}
