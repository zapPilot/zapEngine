import {
  type BaseETLProcessor,
  createFailedETLResult,
  type ETLProcessResult,
} from '../../core/processors/baseETLProcessor.js';
import { MacroFearGreedETLProcessor } from '../../modules/macro-fear-greed/processor.js';
import { TokenPriceETLProcessor } from '../../modules/token-price/processor.js';
import { WalletFetchETLProcessor } from '../../modules/wallet/fetchProcessor.js';
import type {
  DataSource,
  ETLJob,
  ETLJobTask,
  MacroFearGreedBackfillTask,
  TokenPriceBackfillTask,
} from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import {
  accumulateSourceResult,
  buildJobSummary,
  createProcessingResult,
  createSingleSourceFailureResult,
  createSingleSourceSuccessResult,
  type ETLJobProcessingResult,
  type ProcessorHealthSummary,
} from './pipelineFactory.helpers.js';
import {
  PROCESSOR_REGISTRY,
  type ProcessorConstructor,
} from './processorRegistry.js';

/**
 * Factory for creating and managing ETL processors using Strategy pattern
 */
export class ETLPipelineFactory {
  private processors = new Map<DataSource, BaseETLProcessor>();

  constructor(
    registry: Record<DataSource, ProcessorConstructor> = PROCESSOR_REGISTRY,
  ) {
    // Initialize processors for each data source type
    for (const [source, ProcessorClass] of Object.entries(registry)) {
      this.processors.set(source as DataSource, new ProcessorClass());
    }
  }

  /**
   * Get the appropriate processor for a data source
   */
  getProcessor(source: DataSource): BaseETLProcessor {
    const processor = this.processors.get(source);
    if (!processor) {
      throw new Error(`No processor found for data source: ${source}`);
    }
    return processor;
  }

  /**
   * Process multiple data sources for a job
   */
  async processJob(job: ETLJob): Promise<ETLJobProcessingResult> {
    logger.info('Starting ETL job processing with pipeline factory', {
      jobId: job.jobId,
      sources: job.sources,
      filters: job.filters,
      metadata: job.metadata,
    });

    // Special routing for wallet_fetch jobs
    if (job.metadata?.jobType === 'wallet_fetch') {
      return this.processSingleSource(job, new WalletFetchETLProcessor());
    }

    if (job.tasks && job.tasks.length > 0) {
      return this.processTasksForJob(job, createProcessingResult());
    }

    return this.processStandardSources(job, createProcessingResult());
  }

  /**
   * Process a job using a single specialized processor
   * Used for wallet_fetch jobs that don't follow the normal multi-source pattern
   */
  private async processSingleSource(
    job: ETLJob,
    processor: BaseETLProcessor,
  ): Promise<ETLJobProcessingResult> {
    const startTime = Date.now();

    try {
      logger.info('Processing single-source job with specialized processor', {
        jobId: job.jobId,
        processorType: processor.getSourceType(),
      });

      const sourceResult = await processor.process(job);
      const duration = Date.now() - startTime;

      logger.info('Single-source job processing completed', {
        jobId: job.jobId,
        success: sourceResult.success,
        recordsProcessed: sourceResult.recordsProcessed,
        recordsInserted: sourceResult.recordsInserted,
        duration,
      });

      return createSingleSourceSuccessResult(sourceResult);
    } catch (error) {
      logger.error('Single-source job processing failed:', {
        jobId: job.jobId,
        error,
      });

      return createSingleSourceFailureResult(toErrorMessage(error));
    }
  }

  private async processSource(
    source: DataSource,
    job: ETLJob,
  ): Promise<ETLProcessResult> {
    try {
      logger.info('Processing data source with specialized processor', {
        source,
        jobId: job.jobId,
      });

      const processor = this.getProcessor(source);
      const sourceResult = await processor.process(job);

      logger.info('Data source processing completed', {
        source,
        jobId: job.jobId,
        success: sourceResult.success,
        recordsProcessed: sourceResult.recordsProcessed,
        recordsInserted: sourceResult.recordsInserted,
        errorCount: sourceResult.errors.length,
      });

      return sourceResult;
    } catch (error) {
      logger.error('Data source processing failed:', {
        source,
        jobId: job.jobId,
        error,
      });

      return createFailedETLResult(source, toErrorMessage(error));
    }
  }

  private createTaskResult(source: DataSource): ETLProcessResult {
    return {
      success: true,
      recordsProcessed: 0,
      recordsInserted: 0,
      errors: [],
      source,
    };
  }

  private async processTask(
    task: ETLJobTask,
    job: ETLJob,
  ): Promise<ETLProcessResult> {
    if (task.operation === 'current') {
      return this.processSource(task.source, {
        ...job,
        sources: [task.source],
        filters: task.filters ?? job.filters,
      });
    }

    if (task.source === 'token-price') {
      return this.processTokenPriceBackfillTask(task, job);
    }

    return this.processMacroFearGreedBackfillTask(task, job);
  }

  private async processTokenPriceBackfillTask(
    task: TokenPriceBackfillTask,
    job: ETLJob,
  ): Promise<ETLProcessResult> {
    const result = this.createTaskResult('token-price');
    const processor = this.getProcessor(
      'token-price',
    ) as TokenPriceETLProcessor;

    for (const token of task.tokens) {
      const daysBack = token.daysBack ?? 30;

      try {
        logger.info('Processing token price backfill task', {
          jobId: job.jobId,
          tokenId: token.tokenId,
          tokenSymbol: token.tokenSymbol,
          daysBack,
        });

        const backfillResult = await processor.backfillHistory(
          daysBack,
          token.tokenId,
          token.tokenSymbol,
        );
        result.recordsProcessed += backfillResult.requested;
        result.recordsInserted += backfillResult.inserted;

        await processor.updateDmaForToken(
          token.tokenSymbol,
          token.tokenId,
          job.jobId,
        );
      } catch (error) {
        result.success = false;
        result.errors.push(`${token.tokenSymbol}: ${toErrorMessage(error)}`);
      }
    }

    return result;
  }

  private async processMacroFearGreedBackfillTask(
    task: MacroFearGreedBackfillTask,
    job: ETLJob,
  ): Promise<ETLProcessResult> {
    const result = this.createTaskResult('macro-fear-greed');
    const processor = this.getProcessor(
      'macro-fear-greed',
    ) as MacroFearGreedETLProcessor;

    try {
      logger.info('Processing macro Fear & Greed backfill task', {
        jobId: job.jobId,
        startDate: task.startDate,
      });

      const backfillResult = await processor.backfillHistory(task.startDate);
      result.recordsProcessed = backfillResult.requested;
      result.recordsInserted = backfillResult.inserted;
    } catch (error) {
      result.success = false;
      result.errors.push(toErrorMessage(error));
    }

    return result;
  }

  private async processStandardSources(
    job: ETLJob,
    result: ETLJobProcessingResult,
  ): Promise<ETLJobProcessingResult> {
    const startTime = Date.now();

    try {
      await this.processSourcesForJob(job, result);

      const duration = Date.now() - startTime;
      logger.info('ETL job processing completed', {
        jobId: job.jobId,
        success: result.success,
        recordsProcessed: result.recordsProcessed,
        recordsInserted: result.recordsInserted,
        errorCount: result.errors.length,
        duration,
        sourceResults: buildJobSummary(result.sourceResults),
      });

      return result;
    } catch (error) {
      this.applyProcessJobFailure(job, result, error);
      return result;
    }
  }

  private async processTasksForJob(
    job: ETLJob,
    result: ETLJobProcessingResult,
  ): Promise<ETLJobProcessingResult> {
    const startTime = Date.now();

    try {
      for (const task of job.tasks ?? []) {
        const sourceResult = await this.processTask(task, job);
        accumulateSourceResult(result, task.source, sourceResult);
      }

      const duration = Date.now() - startTime;
      logger.info('ETL task job processing completed', {
        jobId: job.jobId,
        success: result.success,
        recordsProcessed: result.recordsProcessed,
        recordsInserted: result.recordsInserted,
        errorCount: result.errors.length,
        duration,
        sourceResults: buildJobSummary(result.sourceResults),
      });

      return result;
    } catch (error) {
      this.applyProcessJobFailure(job, result, error);
      return result;
    }
  }

  private async processSourcesForJob(
    job: ETLJob,
    result: ETLJobProcessingResult,
  ): Promise<void> {
    // Process each data source using its specialized processor
    for (const source of job.sources) {
      const sourceResult = await this.processSource(source, job);
      accumulateSourceResult(result, source, sourceResult);
    }
  }

  /**
   * Perform health check for all registered processors
   */
  async healthCheck(): Promise<ProcessorHealthSummary> {
    const result: ProcessorHealthSummary = {
      status: 'healthy',
      sources: {} as Record<
        DataSource,
        { status: 'healthy' | 'unhealthy'; details?: string }
      >,
    };

    for (const [source, processor] of this.processors) {
      try {
        const health = await processor.healthCheck();
        result.sources[source] = health;

        if (health.status === 'unhealthy') {
          result.status = 'unhealthy';
        }
      } catch (error) {
        result.sources[source] = {
          status: 'unhealthy',
          details: toErrorMessage(error),
        };
        result.status = 'unhealthy';
      }
    }

    return result;
  }

  /**
   * Get statistics for all processors
   */
  getStats(): Record<DataSource, Record<string, unknown>> {
    const stats: Record<DataSource, Record<string, unknown>> = {} as Record<
      DataSource,
      Record<string, unknown>
    >;

    for (const [source, processor] of this.processors) {
      try {
        stats[source] = processor.getStats();
      } catch (error) {
        logger.error('Failed to get stats for processor:', { source, error });
        stats[source] = { error: toErrorMessage(error) };
      }
    }

    return stats;
  }

  /**
   * Get list of supported data sources
   */
  getSupportedSources(): DataSource[] {
    return Array.from(this.processors.keys());
  }

  private applyProcessJobFailure(
    job: ETLJob,
    result: ETLJobProcessingResult,
    error: unknown,
  ): void {
    logger.error('ETL job processing failed with exception:', {
      jobId: job.jobId,
      error,
    });

    result.success = false;
    result.errors.push(toErrorMessage(error));
  }
}
