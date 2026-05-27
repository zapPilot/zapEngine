/**
 * Pure data-mapping functions for analytics-engine responses.
 *
 * No I/O, no logging, no config access — these functions are deterministic
 * transformations of raw JSON payloads into account-engine domain types.
 */

import { DailySuggestionResponseSchema } from '@zapengine/types/strategy';

import { ServiceLayerException } from '../../../common/exceptions';
import { HttpStatus } from '../../../common/http';
import { isFiniteNumber, percentChange } from '../../../common/utils';
import { DailySuggestionData } from '../interfaces/daily-suggestion.interface';
import {
  PortfolioResponse,
  ROIData,
} from '../interfaces/portfolio-response.interface';
import { EmailMetrics } from '../template.service';

type UnknownRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// EmailMetrics mapper
// ---------------------------------------------------------------------------

/**
 * Map a raw `PortfolioResponse` to the `EmailMetrics` shape consumed by
 * `TemplateService`.
 */
export function transformToEmailMetrics(
  portfolioData: PortfolioResponse,
): EmailMetrics {
  const weeklyROI = resolveWeeklyPnLPercentage(portfolioData);

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

function resolveWeeklyPnLPercentage(
  portfolioData: PortfolioResponse,
): number | undefined {
  const windows = portfolioData.portfolio_roi.windows as Record<
    string,
    unknown
  >;
  const roi7d = windows['roi_7d'] as ROIData | undefined;

  if (isFiniteNumber(roi7d?.value)) {
    return roi7d.value;
  }

  // Fall back to computing from the 7-day starting balance vs current net.
  return (
    percentChange(portfolioData.total_net_usd, roi7d?.start_balance) ??
    undefined
  );
}

// ---------------------------------------------------------------------------
// Daily-suggestion response normalizer
// ---------------------------------------------------------------------------

/**
 * Validate and normalise the raw `unknown` payload from analytics-engine into
 * the typed `DailySuggestionData` contract.
 *
 * Throws `ServiceLayerException` (BAD_GATEWAY) on any shape mismatch.
 */
export function normalizeDailySuggestionResponse(
  payload: unknown,
): DailySuggestionData {
  const root = getRecord(payload, 'root');
  const action = getRecord(root['action'], 'action');
  const context = getRecord(root['context'], 'context');
  const market = getRecord(context['market'], 'context["market"]');
  const signal = getRecord(context['signal'], 'context["signal"]');
  const portfolio = getRecord(context['portfolio'], 'context["portfolio"]');
  const target = getRecord(context['target'], 'context["target"]');
  const strategy = getRecord(context['strategy'], 'context["strategy"]');

  const normalized = {
    as_of: getString(root['as_of'], 'as_of'),
    config_id: getString(root['config_id'], 'config_id'),
    config_display_name: getString(
      root['config_display_name'],
      'config_display_name',
    ),
    strategy_id: getString(root['strategy_id'], 'strategy_id'),
    action: {
      status: getActionStatus(action['status'], 'action["status"]'),
      required: getBoolean(action['required'], 'action["required"]'),
      kind:
        action['kind'] === undefined
          ? null
          : getNullableActionKind(action['kind'], 'action["kind"]'),
      reason_code: getString(action['reason_code'], 'action["reason_code"]'),
      transfers: getTransfers(action['transfers'], 'action["transfers"]'),
    },
    context: {
      market: {
        date: getString(market['date'], 'context["market"]["date"]'),
        token_price:
          market['token_price'] === undefined
            ? {}
            : getNumericRecord(
                market['token_price'],
                'context["market"]["token_price"]',
              ),
        sentiment: getNullableNumber(
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
        regime: getString(signal['regime'], 'context["signal"]["regime"]'),
        ...(signal['raw_value'] === undefined
          ? {}
          : {
              raw_value: getNullableNumber(
                signal['raw_value'],
                'context["signal"]["raw_value"]',
              ),
            }),
        ...(signal['confidence'] === undefined
          ? {}
          : {
              confidence: getNullableNumber(
                signal['confidence'],
                'context["signal"]["confidence"]',
              ),
            }),
        details:
          signal['details'] === undefined
            ? {}
            : getRecord(signal['details'], 'context["signal"]["details"]'),
      },
      portfolio: {
        spot_usd: getNumber(
          portfolio['spot_usd'],
          'context["portfolio"]["spot_usd"]',
        ),
        stable_usd: getNumber(
          portfolio['stable_usd'],
          'context["portfolio"]["stable_usd"]',
        ),
        total_value: getNumber(
          portfolio['total_value'],
          'context["portfolio"]["total_value"]',
        ),
        allocation: getNumericRecord(
          portfolio['allocation'],
          'context["portfolio"]["allocation"]',
        ),
        asset_allocation: getNumericRecord(
          portfolio['asset_allocation'],
          'context["portfolio"]["asset_allocation"]',
        ),
        ...(portfolio['total_assets_usd'] === undefined
          ? {}
          : {
              total_assets_usd: getNumber(
                portfolio['total_assets_usd'],
                'context["portfolio"]["total_assets_usd"]',
              ),
            }),
        ...(portfolio['total_debt_usd'] === undefined
          ? {}
          : {
              total_debt_usd: getNumber(
                portfolio['total_debt_usd'],
                'context["portfolio"]["total_debt_usd"]',
              ),
            }),
        ...(portfolio['total_net_usd'] === undefined
          ? {}
          : {
              total_net_usd: getNumber(
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
        allocation: getNumericRecord(
          target['allocation'],
          'context["target"]["allocation"]',
        ),
      },
      strategy: {
        stance: getStrategyStance(
          strategy['stance'],
          'context["strategy"]["stance"]',
        ),
        reason_code: getString(
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
            : getRecord(strategy['details'], 'context["strategy"]["details"]'),
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

// ---------------------------------------------------------------------------
// Field-extraction helpers (package-private — used only within this directory)
// ---------------------------------------------------------------------------

function getRecord(value: unknown, fieldPath: string): UnknownRecord {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as UnknownRecord;
  }

  throw new ServiceLayerException(
    `Unexpected daily suggestion response shape: ${fieldPath} must be an object`,
    HttpStatus.BAD_GATEWAY,
  );
}

function getString(value: unknown, fieldPath: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  throw new ServiceLayerException(
    `Unexpected daily suggestion response shape: ${fieldPath} must be a non-empty string`,
    HttpStatus.BAD_GATEWAY,
  );
}

function getNumber(value: unknown, fieldPath: string): number {
  if (isFiniteNumber(value)) {
    return value;
  }

  throw new ServiceLayerException(
    `Unexpected daily suggestion response shape: ${fieldPath} must be a finite number`,
    HttpStatus.BAD_GATEWAY,
  );
}

function getNullableNumber(value: unknown, fieldPath: string): number | null {
  if (value === null) {
    return null;
  }

  return getNumber(value, fieldPath);
}

function getBoolean(value: unknown, fieldPath: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new ServiceLayerException(
    `Unexpected daily suggestion response shape: ${fieldPath} must be a boolean`,
    HttpStatus.BAD_GATEWAY,
  );
}

function getActionStatus(
  value: unknown,
  fieldPath: string,
): DailySuggestionData['action']['status'] {
  const status = getString(value, fieldPath);

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

function getNullableActionKind(
  value: unknown,
  fieldPath: string,
): DailySuggestionData['action']['kind'] {
  if (value === null) {
    return null;
  }

  const kind = getString(value, fieldPath);
  if (kind === 'rebalance') {
    return kind;
  }

  throw new ServiceLayerException(
    `Unexpected daily suggestion response shape: ${fieldPath} must be "rebalance" or null`,
    HttpStatus.BAD_GATEWAY,
  );
}

function getStrategyStance(
  value: unknown,
  fieldPath: string,
): DailySuggestionData['context']['strategy']['stance'] {
  const stance = getString(value, fieldPath);
  if (stance === 'buy' || stance === 'sell' || stance === 'hold') {
    return stance;
  }

  throw new ServiceLayerException(
    `Unexpected daily suggestion response shape: ${fieldPath} must be one of buy, sell, or hold`,
    HttpStatus.BAD_GATEWAY,
  );
}

function getNumericRecord(
  value: unknown,
  fieldPath: string,
): Record<string, number> {
  return getNullableNumericRecord(value, fieldPath) as Record<string, number>;
}

function getNullableNumericRecord(
  value: unknown,
  fieldPath: string,
): Record<string, number | null> {
  const record = getRecord(value, fieldPath);

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [
      key,
      entry === null ? null : getNumber(entry, `${fieldPath}.${key}`),
    ]),
  );
}

function getTransfers(value: unknown, fieldPath: string) {
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
    const transfer = getRecord(entry, `${fieldPath}.${index}`);

    return {
      from_bucket: getString(
        transfer['from_bucket'],
        `${fieldPath}.${index}["from_bucket"]`,
      ),
      to_bucket: getString(
        transfer['to_bucket'],
        `${fieldPath}.${index}["to_bucket"]`,
      ),
      amount_usd: getNumber(
        transfer['amount_usd'],
        `${fieldPath}.${index}["amount_usd"]`,
      ),
    };
  });
}
