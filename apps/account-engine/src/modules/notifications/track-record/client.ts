/**
 * HTTP transport for the committed track-record equity curve.
 *
 * Transport and validation only — the artifact is turned into a notification by
 * `../strategy-change-message.util.ts`, so no domain mapping lives here.
 */

import { TRACK_RECORD_CONFIG } from '../../../common/constants';
import { ServiceLayerException } from '../../../common/exceptions';
import { HttpStatus } from '../../../common/http';
import { Logger } from '../../../common/logger';
import { getErrorMessage, retryOnceOnTimeout } from '../../../common/utils';
import { ConfigService } from '../../../config/config.service';
import { EquityCurveSubset, EquityCurveSubsetSchema } from './schema';

export class TrackRecordCurveService {
  private readonly logger = new Logger(TrackRecordCurveService.name);
  private readonly curveUrl: string;

  /* istanbul ignore next -- DI constructor */
  constructor(configService: ConfigService) {
    this.curveUrl =
      configService.get<string>('TRACK_RECORD_EQUITY_CURVE_URL') ??
      TRACK_RECORD_CONFIG.EQUITY_CURVE_URL_DEFAULT;
  }

  /**
   * One timeout is retried once: the artifact host is a CDN, and a single
   * cold-edge stall should not turn into a missed daily notification.
   */
  async fetchCurve(): Promise<EquityCurveSubset> {
    try {
      return await retryOnceOnTimeout(
        () => this.fetchOnce(),
        () => {
          this.logger.warn(
            `Timed out fetching equity curve from ${this.curveUrl}; retrying once`,
          );
        },
      );
    } catch (error) {
      if (error instanceof ServiceLayerException) {
        throw error;
      }

      throw new ServiceLayerException(
        `Failed to fetch equity curve from ${this.curveUrl}: ${getErrorMessage(error)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async fetchOnce(): Promise<EquityCurveSubset> {
    const response = await fetch(this.curveUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TRACK_RECORD_CONFIG.REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new ServiceLayerException(
        `Equity curve request failed with status ${response.status}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const parsed = EquityCurveSubsetSchema.safeParse(await response.json());
    if (!parsed.success) {
      // A failed parse always carries at least one issue; a top-level type
      // mismatch reports it with an empty path.
      const issue = parsed.error.issues[0]!;
      const path = issue.path.length ? issue.path.join('.') : 'root';
      throw new ServiceLayerException(
        `Unexpected equity curve shape: ${path} ${issue.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return parsed.data;
  }
}
