/**
 * Design System Constants
 *
 * Consolidated design tokens for consistent styling, animations,
 * and visual elements across the application.
 */

// Color Gradients
export const GRADIENTS = {
  PRIMARY: "from-purple-600 to-blue-600",
  /** Primary gradient with 20% opacity */
  PRIMARY_20: "from-purple-600/20 to-blue-600/20",
  /** Lighter primary gradient for hover states */
  PRIMARY_HOVER: "from-purple-500 to-blue-500",
  /** Primary 400 variant for UI accents */
  PRIMARY_400: "from-purple-400 to-blue-400",
  /** Subtle gradient with 20% opacity */
  PRIMARY_SUBTLE: "from-purple-500/20 to-blue-500/20",
  /** Subtle gradient hover with 30% opacity */
  PRIMARY_SUBTLE_HOVER: "from-purple-500/30 to-blue-500/30",
  /** Faint gradient with 10% opacity */
  PRIMARY_FAINT: "from-purple-500/10 to-blue-500/10",
  /** Faint gradient hover with 20% opacity */
  PRIMARY_FAINT_HOVER: "from-purple-500/20 to-blue-500/20",
  /** Background gradient with purple-gray-blue transition */
  BACKGROUND: "from-purple-900/20 via-gray-950 to-blue-900/20",
  SUCCESS: "from-green-600 to-emerald-600",
  DANGER: "from-red-600 to-pink-600",
  WARNING: "from-yellow-600 to-orange-600",
  INFO: "from-blue-600 to-cyan-600",
  DARK: "from-gray-800 to-gray-900",
  LIGHT: "from-gray-200 to-gray-300",
} as const;

// Layering (z-index) tokens for consistent stacking order
export const Z_INDEX = {
  CONTENT: "z-10",
  BANNER: "z-40", // same as headers, positioned below via top-16
  HEADER: "z-40",
  HEADER_MOBILE: "z-50",
  FAB: "z-40",
  TOAST: "z-50",
  MODAL: "z-60",
  TOOLTIP: "z-[9999]",
} as const;

// Header sizing/offset tokens
export const HEADER = {
  HEIGHT: "h-16",
  TOP_OFFSET: "top-16",
} as const;

// Framer Motion Animation Variants
export const ANIMATIONS = {
  /** Expand/collapse animation for progressive disclosure UI patterns */
  EXPAND_COLLAPSE: {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: "auto" },
    exit: { opacity: 0, height: 0 },
  },
} as const;
