/**
 * Timing Constants
 *
 * Centralized timing values for consistent behavior across the application.
 * All values are in milliseconds unless otherwise noted.
 */

export const TIMINGS = {
  /** Wallet refresh polling interval (30 seconds) */
  WALLET_REFRESH_INTERVAL: 30000,

  /** Modal close delay after successful operation (1.5 seconds) */
  MODAL_CLOSE_DELAY: 1500,

  /** General polling interval for real-time updates (5 seconds) */
  POLLING_INTERVAL: 5000,

  /** Toast auto-dismiss duration (3 seconds) */
  TOAST_DURATION: 3000,

  /** Default debounce delay for input fields (300ms) */
  DEBOUNCE_DELAY: 300,

  /** Animation duration for transitions (200ms) */
  ANIMATION_DURATION: 200,

  /** Request timeout for API calls (30 seconds) */
  REQUEST_TIMEOUT: 30000,
} as const;

// TimingKey type removed - unused (2025-12-22)
