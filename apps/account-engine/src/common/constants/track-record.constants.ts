/**
 * Public track-record artifact the strategy-change notifier reads.
 *
 * The raw.githubusercontent.com URL is deliberate: the artifact is committed by
 * the daily Backtest Refresh workflow, so reading the repo makes freshness a
 * function of that commit rather than of a landing-page deploy.
 */
export const TRACK_RECORD_CONFIG = {
  EQUITY_CURVE_URL_DEFAULT:
    'https://raw.githubusercontent.com/zapPilot/zapEngine/main/apps/landing-page/src/data/equity-curve.json',

  /**
   * Request timeout for the equity-curve fetch (10 seconds)
   */
  REQUEST_TIMEOUT_MS: 10000,
} as const;
