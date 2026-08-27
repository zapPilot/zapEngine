/**
 * Portfolio Constants
 *
 * Consolidated constants for portfolio display configuration.
 */

// Portfolio Display Configuration
export const PORTFOLIO_CONFIG = {
  // Chart configuration
  DEFAULT_PIE_CHART_SIZE: 250,
  DEFAULT_PIE_CHART_STROKE_WIDTH: 8,

  // Display configuration
  CURRENCY_LOCALE: 'en-US',
  CURRENCY_CODE: 'USD',
  HIDDEN_BALANCE_PLACEHOLDER: '••••••••',
  HIDDEN_NUMBER_PLACEHOLDER: '••••',

  // Animation delays
  ANIMATION_DELAY_STEP: 0.1,
  CATEGORY_ANIMATION_DURATION: 0.3,
} as const;
