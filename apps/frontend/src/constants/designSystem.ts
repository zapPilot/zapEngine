/**
 * Design System Constants
 *
 * Consolidated design tokens for consistent styling, animations,
 * and visual elements across the application.
 */

// Token-backed surface utilities.
// The export name is kept for API compatibility with existing callers.
export const GRADIENTS = {
  PRIMARY: 'bg-accent',
  PRIMARY_20: 'bg-accent/20',
  PRIMARY_HOVER: 'bg-accent hover:bg-accent/90',
  PRIMARY_400: 'bg-accent/80',
  PRIMARY_SUBTLE: 'bg-accent/20',
  PRIMARY_SUBTLE_HOVER: 'bg-accent/30',
  PRIMARY_FAINT: 'bg-accent/10',
  PRIMARY_FAINT_HOVER: 'bg-accent/20',
  BACKGROUND: 'bg-bg',
  SUCCESS: 'bg-success',
  DANGER: 'bg-error',
  WARNING: 'bg-accent',
  INFO: 'bg-usd',
  DARK: 'bg-surface-elevated',
  LIGHT: 'bg-spy',
} as const;

// Layering (z-index) tokens for consistent stacking order
export const Z_INDEX = {
  CONTENT: 'z-10',
  BANNER: 'z-40', // same as headers, positioned below via top-16
  HEADER: 'z-40',
  HEADER_MOBILE: 'z-50',
  FAB: 'z-40',
  TOAST: 'z-50',
  MODAL: 'z-60',
  TOOLTIP: 'z-[9999]',
} as const;

// Header sizing/offset tokens
export const HEADER = {
  HEIGHT: 'h-16',
  TOP_OFFSET: 'top-16',
} as const;

// Framer Motion Animation Variants
export const ANIMATIONS = {
  /** Expand/collapse animation for progressive disclosure UI patterns */
  EXPAND_COLLAPSE: {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
  },
} as const;
