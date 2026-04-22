/**
 * Portfolio Utility Functions
 *
 * Shared utilities for portfolio data processing.
 * Extracted to eliminate duplication across adapters and hooks.
 */

import type { LandingPageResponse } from '@/services';

/**
 * ROI change data structure
 */
export interface ROIChanges {
  change7d: number;
  change30d: number;
}

/**
 * Extracts ROI changes from landing page data
 *
 * Handles both the modern `windows` format and legacy `roi_7d`/`roi_30d` fields.
 *
 * @param landingData - Landing page response from analytics API
 * @returns ROI changes for 7-day and 30-day periods
 */
export function extractROIChanges(
  landingData: LandingPageResponse,
): ROIChanges {
  const roiData = landingData.portfolio_roi;

  if (!roiData) {
    return { change7d: 0, change30d: 0 };
  }

  if (roiData.windows) {
    return {
      change7d: roiData.windows['7d']?.value ?? 0,
      change30d: roiData.windows['30d']?.value ?? 0,
    };
  }

  // Fallback to legacy fields
  return {
    change7d: roiData.roi_7d?.value ?? 0,
    change30d: roiData.roi_30d?.value ?? 0,
  };
}
