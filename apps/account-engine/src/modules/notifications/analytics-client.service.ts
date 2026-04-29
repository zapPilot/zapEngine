import { DailySuggestionResponseSchema } from '@zapengine/types/strategy';

import { ANALYTICS_CONFIG } from '@/common/constants';
import { ServiceLayerException } from '@/common/exceptions';
import { HttpStatus } from '@/common/http';
import { Logger } from '@/common/logger';
import { getErrorMessage, UrlValidator } from '@/common/utils';
import { ConfigService } from '@/config/config.service';

import { PortfolioNotFoundError } from './errors/portfolio-not-found.error';
import { DailySuggestionData } from './interfaces/daily-suggestion.interface';
import {
  PortfolioResponse,
  ROIData,
} from './interfaces/portfolio-response.interface';
import { PortfolioTrendResponse } from './interfaces/portfolio-trend.interface';
import { EmailMetrics } from './template.service';

type UnknownRecord = Record<string, unknown>;

export class AnalyticsClientService {
  private readonly logger = new Logger(AnalyticsClientService.name);
  private readonly analyticsEngineUrl: string;
  private readonly portfolioTrendsBaseUrl: string;

  /* istanbul ignore next -- DI constructor */
  constructor(private configService: ConfigService) {
    const configuredAnalyticsEngineUrl =
      this.configService.get<string>('ANALYTICS_ENGINE_URL') ?? '';
    this.analyticsEngineUrl = UrlValidator.normalizeLoopbackUrl(
      configuredAnalyticsEngineUrl,
    );

    // Validate environment variable is loaded
    if (!this.analyticsEngineUrl) {
      const error =
        'ANALYTICS_ENGINE_URL environment variable is not configured';
      this.logger.error(error);
      throw new Error(error);
    }

    this.portfolioTrendsBaseUrl = this.resolvePortfolioTrendsBaseUrl(
      this.analyticsEngineUrl,
    );

    if (configuredAnalyticsEngineUrl !== this.analyticsEngineUrl) {
      this.logger.log(
        `Analytics Engine URL configured: ${configuredAnalyticsEngineUrl} -> ${this.analyticsEngineUrl}`,
      );
    } else {
      this.logger.log(
        `Analytics Engine URL configured: ${this.analyticsEngineUrl}`,
      );
    }
  }

  async getPortfolioData(userId: string): Promise<PortfolioResponse> {
    return this.fetchFromAnalytics<PortfolioResponse>(
      `/api/v2/portfolio/${userId}/landing`,
      'portfolio data',
      userId,
    );
  }

  async getDailySuggestion(userId: string): Promise<DailySuggestionData> {
    // Daily suggestion occasionally has a cold-path spike on the first upstream call
    // (~13-14s observed) before subsequent requests drop below 1s.
    const response = await this.fetchFromAnalytics<unknown>(
      `/api/v3/strategy/daily-suggestion/${userId}?config_id=eth_btc_rotation_default`,
      'daily suggestion',
      userId,
      {
        retryOnTimeout: true,
        timeoutMs: ANALYTICS_CONFIG.DAILY_SUGGESTION_REQUEST_TIMEOUT_MS,
      },
    );

    return this.normalizeDailySuggestionResponse(response);
  }

  private async fetchFromAnalytics<T>(
    path: string,
    label: string,
    userId: string,
    options?: {
      baseUrl?: string;
      params?: Record<string, unknown>;
      retryOnTimeout?: boolean;
      timeoutMs?: number;
    },
  ): Promise<T> {
    const base = UrlValidator.normalizeLoopbackUrl(
      options?.baseUrl ?? this.analyticsEngineUrl,
    );
    const maxAttempts = options?.retryOnTimeout ? 2 : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      this.logger.log(`Fetching ${label} for user: ${userId} from ${base}`);

      try {
        const response = await this.fetchJson<T>(`${base}${path}`, {
          timeoutMs: options?.timeoutMs,
          params: options?.params,
        });

        this.logger.log(
          `Successfully retrieved ${label} for user: ${userId} from ${base} in ${Date.now() - startedAt}ms`,
        );
        return response;
      } catch (error) {
        lastError = error;
        const elapsedMs = Date.now() - startedAt;

        if (attempt < maxAttempts && this.isRetryableTimeoutError(error)) {
          this.logger.warn(
            `Timed out fetching ${label} for user ${userId} from ${base} after ${elapsedMs}ms; retrying once`,
          );
          continue;
        }

        this.logger.error(
          `Failed to get ${label} for user ${userId} from ${base} after ${elapsedMs}ms:`,
          error,
        );
        this.handleAnalyticsError(error, userId, label);
      }
    }

    /* istanbul ignore next -- all loop paths call handleAnalyticsError (which throws) before reaching here */
    this.handleAnalyticsError(lastError, userId, label);
  }

  private getRequestTimeout(
    timeoutMs: number = ANALYTICS_CONFIG.REQUEST_TIMEOUT_MS,
  ): number {
    return timeoutMs;
  }

  private handleAnalyticsError(
    error: unknown,
    userId: string,
    operationLabel: string,
  ): never {
    if (error instanceof ServiceLayerException) {
      throw error;
    }

    const axiosError = error as {
      response?: { status?: number };
      code?: string;
      message?: string;
    };

    if (axiosError.response?.status === 404) {
      throw new PortfolioNotFoundError(
        userId,
        `${operationLabel.charAt(0).toUpperCase() + operationLabel.slice(1)} not found for user: ${userId}. User may be newly onboarded or portfolio not yet indexed.`,
      );
    }
    if (axiosError.response?.status === 500) {
      throw new ServiceLayerException(
        `Analytics engine internal error for user: ${userId}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    if (axiosError.code === 'ECONNREFUSED') {
      throw new ServiceLayerException(
        'Cannot connect to analytics engine. Please check if the service is running.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    throw new ServiceLayerException(
      `Failed to retrieve ${operationLabel}: ${axiosError.message ?? 'Unknown error'}`,
    );
  }

  private isRetryableTimeoutError(error: unknown): boolean {
    const axiosError = error as { code?: string; message?: string };
    return (
      axiosError.code === 'ECONNABORTED' ||
      axiosError.code === 'ETIMEOUT' ||
      axiosError.message?.includes('timeout') === true
    );
  }

  async getPortfolioTrendData(userId: string): Promise<PortfolioTrendResponse> {
    return this.fetchFromAnalytics<PortfolioTrendResponse>(
      `/api/v2/analytics/${userId}/trend`,
      'portfolio trend data',
      userId,
      { baseUrl: this.portfolioTrendsBaseUrl, params: { days: 365 } },
    );
  }

  transformToEmailMetrics(portfolioData: PortfolioResponse): EmailMetrics {
    const weeklyROI = this.resolveWeeklyPnLPercentage(portfolioData);

    return {
      currentBalance: portfolioData.total_net_usd,
      estimatedYearlyROI: portfolioData.portfolio_roi.recommended_yearly_roi,
      estimatedYearlyPnL: portfolioData.portfolio_roi.estimated_yearly_pnl_usd,
      monthlyIncome: portfolioData.estimated_monthly_income,
      weightedAPR: portfolioData.weighted_apr,
      walletCount: portfolioData.wallet_count,
      recommendedPeriod: portfolioData.portfolio_roi.recommended_period,
      lastUpdated: portfolioData.last_updated ?? undefined,
      ...(weeklyROI !== undefined ? { weeklyPnLPercentage: weeklyROI } : {}),
    };
  }

  private resolveWeeklyPnLPercentage(
    portfolioData: PortfolioResponse,
  ): number | undefined {
    const windows = portfolioData.portfolio_roi.windows as Record<
      string,
      unknown
    >;
    const roi7d = windows['roi_7d'] as ROIData | undefined;

    if (this.isFiniteNumber(roi7d?.value)) {
      return roi7d.value;
    }

    const startBalance = roi7d?.start_balance;
    if (
      this.isFiniteNumber(startBalance) &&
      startBalance > 0 &&
      this.isFiniteNumber(portfolioData.total_net_usd)
    ) {
      return (
        ((portfolioData.total_net_usd - startBalance) / startBalance) * 100
      );
    }

    return undefined;
  }

  async validateAnalyticsConnection(): Promise<{
    connected: boolean;
    message: string;
  }> {
    try {
      // Try to hit a health endpoint or the base URL
      await this.fetchJson(`${this.analyticsEngineUrl}/health`, {
        timeoutMs: ANALYTICS_CONFIG.HEALTH_CHECK_TIMEOUT_MS,
      });
      return {
        connected: true,
        message: 'Analytics engine connection successful',
      };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.warn('Analytics engine health check failed:', message);
      return {
        connected: false,
        message: `Analytics engine not available: ${message}`,
      };
    }
  }

  getAnalyticsEngineUrl(): string {
    return this.analyticsEngineUrl;
  }

  private normalizeDailySuggestionResponse(
    payload: unknown,
  ): DailySuggestionData {
    const root = this.getRecord(payload, 'root');
    const action = this.getRecord(root['action'], 'action');
    const context = this.getRecord(root['context'], 'context');
    const market = this.getRecord(context['market'], 'context["market"]');
    const signal = this.getRecord(context['signal'], 'context["signal"]');
    const portfolio = this.getRecord(
      context['portfolio'],
      'context["portfolio"]',
    );
    const target = this.getRecord(context['target'], 'context["target"]');
    const strategy = this.getRecord(context['strategy'], 'context["strategy"]');

    const normalized = {
      as_of: this.getString(root['as_of'], 'as_of'),
      config_id: this.getString(root['config_id'], 'config_id'),
      config_display_name: this.getString(
        root['config_display_name'],
        'config_display_name',
      ),
      strategy_id: this.getString(root['strategy_id'], 'strategy_id'),
      action: {
        status: this.getActionStatus(action['status'], 'action["status"]'),
        required: this.getBoolean(action['required'], 'action["required"]'),
        kind:
          action['kind'] === undefined
            ? null
            : this.getNullableActionKind(action['kind'], 'action["kind"]'),
        reason_code: this.getString(
          action['reason_code'],
          'action["reason_code"]',
        ),
        transfers: this.getTransfers(
          action['transfers'],
          'action["transfers"]',
        ),
      },
      context: {
        market: {
          date: this.getString(market['date'], 'context["market"]["date"]'),
          token_price:
            market['token_price'] === undefined
              ? {}
              : this.getNumericRecord(
                  market['token_price'],
                  'context["market"]["token_price"]',
                ),
          sentiment: this.getNullableNumber(
            market['sentiment'],
            'context["market"]["sentiment"]',
          ),
          sentiment_label:
            typeof market['sentiment_label'] === 'string' ||
            market['sentiment_label'] === null
              ? (market['sentiment_label'] ?? null)
              : null,
        },
        signal: {
          ...(typeof signal['id'] === 'string' ? { id: signal['id'] } : {}),
          regime: this.getString(
            signal['regime'],
            'context["signal"]["regime"]',
          ),
          ...(signal['raw_value'] === undefined
            ? {}
            : {
                raw_value: this.getNullableNumber(
                  signal['raw_value'],
                  'context["signal"]["raw_value"]',
                ),
              }),
          ...(signal['confidence'] === undefined
            ? {}
            : {
                confidence: this.getNullableNumber(
                  signal['confidence'],
                  'context["signal"]["confidence"]',
                ),
              }),
          details:
            signal['details'] === undefined
              ? {}
              : this.getRecord(
                  signal['details'],
                  'context["signal"]["details"]',
                ),
        },
        portfolio: {
          spot_usd: this.getNumber(
            portfolio['spot_usd'],
            'context["portfolio"]["spot_usd"]',
          ),
          stable_usd: this.getNumber(
            portfolio['stable_usd'],
            'context["portfolio"]["stable_usd"]',
          ),
          total_value: this.getNumber(
            portfolio['total_value'],
            'context["portfolio"]["total_value"]',
          ),
          allocation: this.getNumericRecord(
            portfolio['allocation'],
            'context["portfolio"]["allocation"]',
          ),
          ...(portfolio['total_assets_usd'] === undefined
            ? {}
            : {
                total_assets_usd: this.getNumber(
                  portfolio['total_assets_usd'],
                  'context["portfolio"]["total_assets_usd"]',
                ),
              }),
          ...(portfolio['total_debt_usd'] === undefined
            ? {}
            : {
                total_debt_usd: this.getNumber(
                  portfolio['total_debt_usd'],
                  'context["portfolio"]["total_debt_usd"]',
                ),
              }),
          ...(portfolio['total_net_usd'] === undefined
            ? {}
            : {
                total_net_usd: this.getNumber(
                  portfolio['total_net_usd'],
                  'context["portfolio"]["total_net_usd"]',
                ),
              }),
          ...(typeof portfolio['spot_asset'] === 'string' ||
          portfolio['spot_asset'] === null
            ? { spot_asset: portfolio['spot_asset'] ?? null }
            : {}),
        },
        target: {
          allocation: this.getNumericRecord(
            target['allocation'],
            'context["target"]["allocation"]',
          ),
        },
        strategy: {
          stance: this.getStrategyStance(
            strategy['stance'],
            'context["strategy"]["stance"]',
          ),
          reason_code: this.getString(
            strategy['reason_code'],
            'context["strategy"]["reason_code"]',
          ),
          ...(typeof strategy['rule_group'] === 'string' ||
          strategy['rule_group'] === null
            ? { rule_group: strategy['rule_group'] ?? null }
            : {}),
          details:
            strategy['details'] === undefined
              ? {}
              : this.getRecord(
                  strategy['details'],
                  'context["strategy"]["details"]',
                ),
        },
      },
    };

    const parsed = DailySuggestionResponseSchema.safeParse(normalized);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.length ? issue.path.join('.') : 'root';
      const message = issue?.message ?? 'invalid contract payload';
      throw new ServiceLayerException(
        `Unexpected daily suggestion response shape: ${path} ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return parsed.data;
  }

  private resolvePortfolioTrendsBaseUrl(baseUrl: string): string {
    if (!UrlValidator.isValidHttpUrl(baseUrl)) {
      return UrlValidator.normalizeLoopbackUrl(
        `http://localhost:${ANALYTICS_CONFIG.DEFAULT_TRENDS_PORT}`,
      );
    }

    try {
      const url = new URL(UrlValidator.normalizeLoopbackUrl(baseUrl));

      if (url.port === String(ANALYTICS_CONFIG.DEFAULT_BASE_PORT)) {
        url.port = String(ANALYTICS_CONFIG.DEFAULT_TRENDS_PORT);
        return UrlValidator.normalizeLoopbackUrl(url.origin);
      }

      return UrlValidator.normalizeLoopbackUrl(UrlValidator.getOrigin(baseUrl));
    } /* istanbul ignore next -- URL already validated by isValidHttpUrl above */ catch (error) {
      this.logger.warn(
        'Unable to derive analytics trends URL from base; using default',
        error instanceof Error ? error.message : error,
      );
      return UrlValidator.normalizeLoopbackUrl(
        `http://localhost:${ANALYTICS_CONFIG.DEFAULT_TRENDS_PORT}`,
      );
    }
  }

  private getRecord(value: unknown, fieldPath: string): UnknownRecord {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as UnknownRecord;
    }

    throw new ServiceLayerException(
      `Unexpected daily suggestion response shape: ${fieldPath} must be an object`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private getString(value: unknown, fieldPath: string): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    throw new ServiceLayerException(
      `Unexpected daily suggestion response shape: ${fieldPath} must be a non-empty string`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private getNumber(value: unknown, fieldPath: string): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    throw new ServiceLayerException(
      `Unexpected daily suggestion response shape: ${fieldPath} must be a finite number`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private getNullableNumber(value: unknown, fieldPath: string): number | null {
    if (value === null) {
      return null;
    }

    return this.getNumber(value, fieldPath);
  }

  private getBoolean(value: unknown, fieldPath: string): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    throw new ServiceLayerException(
      `Unexpected daily suggestion response shape: ${fieldPath} must be a boolean`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private getActionStatus(
    value: unknown,
    fieldPath: string,
  ): DailySuggestionData['action']['status'] {
    const status = this.getString(value, fieldPath);

    if (
      status === 'action_required' ||
      status === 'blocked' ||
      status === 'no_action'
    ) {
      return status;
    }

    throw new ServiceLayerException(
      `Unexpected daily suggestion response shape: ${fieldPath} must be one of action_required, blocked, or no_action`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private getNullableActionKind(
    value: unknown,
    fieldPath: string,
  ): DailySuggestionData['action']['kind'] {
    if (value === null) {
      return null;
    }

    const kind = this.getString(value, fieldPath);
    if (kind === 'rebalance') {
      return kind;
    }

    throw new ServiceLayerException(
      `Unexpected daily suggestion response shape: ${fieldPath} must be "rebalance" or null`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private getStrategyStance(
    value: unknown,
    fieldPath: string,
  ): DailySuggestionData['context']['strategy']['stance'] {
    const stance = this.getString(value, fieldPath);
    if (stance === 'buy' || stance === 'sell' || stance === 'hold') {
      return stance;
    }

    throw new ServiceLayerException(
      `Unexpected daily suggestion response shape: ${fieldPath} must be one of buy, sell, or hold`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private getNumericRecord(
    value: unknown,
    fieldPath: string,
  ): Record<string, number> {
    return this.getNullableNumericRecord(value, fieldPath) as Record<
      string,
      number
    >;
  }

  private getNullableNumericRecord(
    value: unknown,
    fieldPath: string,
  ): Record<string, number | null> {
    const record = this.getRecord(value, fieldPath);

    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [
        key,
        entry === null ? null : this.getNumber(entry, `${fieldPath}.${key}`),
      ]),
    );
  }

  private getTransfers(value: unknown, fieldPath: string) {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new ServiceLayerException(
        `Unexpected daily suggestion response shape: ${fieldPath} must be an array`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return value.map((entry, index) => {
      const transfer = this.getRecord(entry, `${fieldPath}.${index}`);

      return {
        from_bucket: this.getString(
          transfer['from_bucket'],
          `${fieldPath}.${index}["from_bucket"]`,
        ),
        to_bucket: this.getString(
          transfer['to_bucket'],
          `${fieldPath}.${index}["to_bucket"]`,
        ),
        amount_usd: this.getNumber(
          transfer['amount_usd'],
          `${fieldPath}.${index}["amount_usd"]`,
        ),
      };
    });
  }

  private async fetchJson<T>(
    url: string,
    options?: {
      timeoutMs?: number;
      params?: Record<string, unknown>;
    },
  ): Promise<T> {
    const requestUrl = new URL(url);

    for (const [key, value] of Object.entries(options?.params ?? {})) {
      if (value !== undefined && value !== null) {
        requestUrl.searchParams.set(key, this.stringifyQueryValue(value));
      }
    }

    const response = await fetch(requestUrl.toString(), {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.getRequestTimeout(options?.timeoutMs)),
    });

    if (!response.ok) {
      const error = new Error(
        `Request failed with status ${response.status}: ${await response.text()}`,
      ) as Error & { response?: { status: number }; code?: string };
      error.response = { status: response.status };
      throw error;
    }

    return (await response.json()) as T;
  }

  private stringifyQueryValue(value: unknown): string {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }

    /* istanbul ignore next -- no current public method passes non-primitive params */
    return JSON.stringify(value);
  }
}
