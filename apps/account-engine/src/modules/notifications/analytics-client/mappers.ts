/**
 * Pure data-mapping functions for analytics-engine responses.
 *
 * No I/O, no logging, no config access — these functions are deterministic
 * transformations of raw JSON payloads into account-engine domain types.
 */

import { isFiniteNumber } from '@zapengine/types/shared';

import {
  PortfolioResponse,
  ROIData,
} from '../interfaces/portfolio-response.interface';
import { EmailMetrics } from '../template.service';

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

  if (
    isFiniteNumber(roi7d?.value) &&
    isFiniteNumber(roi7d.data_points) &&
    roi7d.data_points >= 2 &&
    isFiniteNumber(roi7d.start_balance) &&
    roi7d.start_balance > 0 &&
    isFiniteNumber(roi7d.days_spanned) &&
    roi7d.days_spanned >= 6
  ) {
    return roi7d.value;
  }

  return undefined;
}
