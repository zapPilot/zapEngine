#!/usr/bin/env tsx

/**
 * Test script to simulate the actual ETL pipeline flow
 * This reproduces the exact same flow as the webhook trigger:
 * 1. ETL processor processes DeFiLlama source
 * 2. DeFiLlama fetcher returns transformed PoolData
 * 3. ETL processor calls transformer.transformBatch() 
 * 4. Writer inserts to database
 */

import { ETLPipelineFactory } from '../src/modules/core/pipelineFactory.js';
import { logger } from '../src/utils/logger.js';
import type { ETLJob } from '../src/types/index.js';

const TEST_CHAIN = 'ethereum';
const TEST_MIN_TVL = 1_000_000;

function createTestJob(): ETLJob {
  return {
    jobId: `test-pipeline-${Date.now()}`,
    trigger: 'manual',
    sources: ['defillama'],
    filters: {
      minTvl: TEST_MIN_TVL,
      chains: [TEST_CHAIN]
    },
    createdAt: new Date(),
    status: 'pending'
  };
}

function getSuccessRateLabel(recordsInserted: number, recordsProcessed: number): string {
  if (recordsProcessed <= 0) {
    return '0%';
  }

  return `${((recordsInserted / recordsProcessed) * 100).toFixed(2)}%`;
}

function exitWithFailure(message: string, context?: Record<string, unknown>): never {
  logger.error(message, context);
  process.exit(1);
}

async function testETLPipeline(): Promise<void> {
  logger.info('Starting ETL pipeline test');

  try {
    const processor = new ETLPipelineFactory();

    // Create a test job similar to what would come from webhook
    const testJob = createTestJob();

    logger.info('Processing test job', { 
      jobId: testJob.jobId,
      sources: testJob.sources,
      filters: testJob.filters
    });

    // This should reproduce the exact same flow that failed before
    const result = await processor.processJob(testJob);

    logger.info('ETL pipeline test results', {
      success: result.success,
      recordsProcessed: result.recordsProcessed,
      recordsInserted: result.recordsInserted,
      errors: result.errors.length,
      sourceResults: result.sourceResults
    });

    if (!result.success) {
      exitWithFailure('ETL pipeline test failed', {
        errors: result.errors.slice(0, 10)
      });
    }

    if (result.recordsInserted === 0 && result.recordsProcessed > 0) {
      exitWithFailure('Zero records inserted despite processing records - this was the original bug!');
    }

    logger.info('✅ ETL pipeline test passed successfully!');
    
    // Log some stats
    for (const [source, sourceResult] of Object.entries(result.sourceResults)) {
      logger.info(`Source ${source} results:`, {
        processed: sourceResult.recordsProcessed,
        inserted: sourceResult.recordsInserted,
        errorCount: sourceResult.errors.length,
        successRate: getSuccessRateLabel(sourceResult.recordsInserted, sourceResult.recordsProcessed)
      });
    }

  } catch (error) {
    exitWithFailure('ETL pipeline test failed with exception:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Run the test
testETLPipeline().catch((error) => {
  exitWithFailure('Unhandled error in ETL pipeline test:', { error });
});
