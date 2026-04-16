import { HttpStatus } from '@common/http';
import { Logger } from '@common/logger';
import { ConfigService } from '@config/config.service';
import { type EtlJobStatus, EtlJobStatusSchema } from '@zapengine/types/etl';

import { ServiceLayerException } from '../exceptions';
import { getErrorMessage, truncateForLog } from '../utils';

/**
 * HTTP client service for communicating with alpha-etl service
 *
 * Handles:
 * - Health ping to wake up Fly.io cold starts
 * - Wallet fetch webhook triggers
 * - Retry logic for transient failures
 */
export class AlphaEtlHttpService {
  private readonly logger = new Logger(AlphaEtlHttpService.name);
  private readonly alphaEtlUrl: string;
  private readonly webhookSecret: string;

  private readonly HEALTH_CHECK_TIMEOUT_MS = 5000;
  private readonly WEBHOOK_TIMEOUT_MS = 30000;
  private readonly JOB_STATUS_TIMEOUT_MS = 5000;

  /* istanbul ignore next -- DI constructor */
  constructor(private readonly configService: ConfigService) {
    this.alphaEtlUrl =
      this.configService.get<string>('ALPHA_ETL_URL') ??
      'http://localhost:3003';
    this.webhookSecret =
      this.configService.get<string>('ALPHA_ETL_WEBHOOK_SECRET') ?? '';
  }

  /**
   * Ping alpha-etl health endpoint to wake up service if needed
   * Implements retry logic for Fly.io cold starts
   *
   * @returns true if health check passed, false otherwise
   */
  async healthPing(): Promise<boolean> {
    this.logger.log('Pinging alpha-etl health endpoint...');

    const response = await this.fetchWithRetry(
      `${this.alphaEtlUrl}/health`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(this.HEALTH_CHECK_TIMEOUT_MS),
      },
      { retryDelayMs: 2000, label: 'Alpha-ETL health check' },
    );

    if (!response) {
      return false;
    }

    if (response.ok) {
      this.logger.log('Alpha-ETL health check passed');
      return true;
    }

    this.logger.warn(`Alpha-ETL health check failed: ${response.status}`, {
      status: response.status,
      statusText: response.statusText,
    });
    return false;
  }

  /**
   * Trigger wallet data fetch via webhook
   *
   * @param userId - User UUID
   * @param walletAddress - Ethereum wallet address (0x...)
   * @param trigger - Trigger type ('manual' | 'webhook')
   * @returns Job ID for status tracking
   * @throws Error if webhook call fails
   */
  async triggerWalletFetch(
    userId: string,
    walletAddress: string,
    trigger: 'manual' | 'webhook' = 'webhook',
  ): Promise<{ jobId: string }> {
    this.logger.log('Sending wallet fetch webhook to alpha-etl...', {
      userId,
      walletAddress: truncateForLog(walletAddress),
      trigger,
    });

    try {
      const response = await fetch(
        `${this.alphaEtlUrl}/webhooks/wallet-fetch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId,
            walletAddress,
            trigger,
            secret: this.webhookSecret,
          }),
          signal: AbortSignal.timeout(this.WEBHOOK_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new ServiceLayerException(
          `Alpha-ETL webhook failed: ${response.status} ${errorText}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const result = await response.json();

      this.logger.log('Alpha-ETL webhook response received', {
        jobId: result.data?.jobId,
        success: result.success,
      });

      if (!result.success || !result.data?.jobId) {
        throw new ServiceLayerException(
          'Alpha-ETL webhook returned invalid response',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        jobId: result.data.jobId,
      };
    } catch (error) {
      this.logger.error('Failed to trigger alpha-etl webhook', {
        error: getErrorMessage(error),
        userId,
        walletAddress: truncateForLog(walletAddress),
      });
      throw error;
    }
  }

  /**
   * Get job status from alpha-etl
   *
   * @param jobId - Job ID returned from triggerWalletFetch()
   * @returns Job status response (validated against contract)
   * @throws Error if job not found or request fails
   */
  async getJobStatus(jobId: string): Promise<EtlJobStatus> {
    this.logger.log('Fetching job status from alpha-etl...', { jobId });

    try {
      const response = await fetch(
        `${this.alphaEtlUrl}/webhooks/jobs/${jobId}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(this.JOB_STATUS_TIMEOUT_MS),
        },
      );

      if (response.status === 404) {
        throw new ServiceLayerException('Job not found', HttpStatus.NOT_FOUND);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new ServiceLayerException(
          `Alpha-ETL job status failed: ${response.status} ${errorText}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const apiResponse = await response.json();

      if (!apiResponse.success || !apiResponse.data) {
        const error = apiResponse.error as unknown;
        const errorMessage = error
          ? getErrorMessage(error)
          : 'Alpha-ETL job status returned invalid response';
        throw new ServiceLayerException(errorMessage, HttpStatus.BAD_GATEWAY);
      }

      // Validate response data against contract schema

      const validated = EtlJobStatusSchema.parse(apiResponse.data);

      return validated;
    } catch (error) {
      this.logger.error('Failed to fetch job status from alpha-etl', {
        error: getErrorMessage(error),
        jobId,
      });
      throw error;
    }
  }

  /**
   * Fetch with a single retry attempt after a delay.
   * Returns the Response on success, or null if both attempts fail.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    options: { retryDelayMs: number; label: string },
  ): Promise<Response | null> {
    try {
      return await fetch(url, init);
    } catch (error) {
      this.logger.warn(`${options.label} failed on first attempt`, {
        error: getErrorMessage(error),
      });
    }

    this.logger.log(
      `Retrying ${options.label.toLowerCase()} after ${options.retryDelayMs}ms delay...`,
    );
    await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs));

    try {
      return await fetch(url, init);
    } catch (retryError) {
      this.logger.warn(`${options.label} failed on retry`, {
        error: getErrorMessage(retryError),
      });
      return null;
    }
  }
}
