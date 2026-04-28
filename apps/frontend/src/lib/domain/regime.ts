/**
 * Unified Regime Domain Logic
 *
 * CONSOLIDATED from multiple sources (2026-04-28):
 * - lib/domain/regimeMapper.ts (labels, sentiment/status mappers)
 * - constants/regimeDisplay.ts (display config)
 * - constants/regimes.ts (default quotes)
 * - marketDashboardConstants.ts (colors, color/label helpers)
 * - chartHelpers.ts (sentiment index map)
 * - strategySelector.ts (regime order)
 *
 * This is the SINGLE SOURCE OF TRUTH for all regime-related logic.
 *
 * Key systems:
 * - RegimeId (short): 'ef' | 'f' | 'n' | 'g' | 'eg' — internal frontend use
 * - RegimeLabel (snake_case): 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed' — backend API format
 */

import { logger } from '@/utils';

/* eslint-disable sonarjs/deprecation -- RegimeLabel kept for backward compatibility with API */

// =============================================================================
// TYPES
// =============================================================================

export type RegimeId = 'ef' | 'f' | 'n' | 'g' | 'eg';

/**
 * Backend API format. Kept for compatibility with API responses.
 * @deprecated Use RegimeId + REGIME_LABELS instead. Will be removed after migration.
 */
export type RegimeLabel =
  | 'extreme_fear'
  | 'fear'
  | 'neutral'
  | 'greed'
  | 'extreme_greed';

// =============================================================================
// BIDIRECTIONAL MAPPING
// =============================================================================

export const REGIME_ID_TO_LABEL: Record<RegimeId, RegimeLabel> = {
  ef: 'extreme_fear',
  f: 'fear',
  n: 'neutral',
  g: 'greed',
  eg: 'extreme_greed',
};

export const LABEL_TO_REGIME_ID: Record<RegimeLabel, RegimeId> = {
  extreme_fear: 'ef',
  fear: 'f',
  neutral: 'n',
  greed: 'g',
  extreme_greed: 'eg',
};

// =============================================================================
// STATIC DATA
// =============================================================================

/**
 * Human-readable labels for each regime (short form keys).
 * Used throughout the UI for displaying regime names.
 */
export const REGIME_LABELS: Record<RegimeId, string> = {
  ef: 'Extreme Fear',
  f: 'Fear',
  n: 'Neutral',
  g: 'Greed',
  eg: 'Extreme Greed',
};

/**
 * Color mapping for regime display in charts/dashboards.
 * Uses the "direct" convention: red=fear, green=greed.
 * Note: regimeData.ts uses the OPPOSITE "contrarian" convention
 * (green=fear, red=greed) for strategy visualization.
 */
export const REGIME_COLORS: Record<RegimeId, string> = {
  ef: '#ef4444', // red-500
  f: '#f97316', // orange-500
  n: '#eab308', // yellow-500
  g: '#84cc16', // lime-500
  eg: '#22c55e', // green-500
};

/**
 * Full display configuration for regime UI components.
 * Includes colors, tailwind classes, and default sentiment values.
 */
export const REGIME_DISPLAY_CONFIG: Record<
  RegimeId,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    barColor: string;
    fillColor: string;
    value: number;
  }
> = {
  ef: {
    label: 'Extreme Fear',
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    barColor: 'bg-rose-500',
    fillColor: '#f43f5e',
    value: 10,
  },
  f: {
    label: 'Fear',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    barColor: 'bg-orange-500',
    fillColor: '#f97316',
    value: 30,
  },
  n: {
    label: 'Neutral',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    barColor: 'bg-blue-500',
    fillColor: '#60a5fa',
    value: 50,
  },
  g: {
    label: 'Greed',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    barColor: 'bg-emerald-500',
    fillColor: '#10b981',
    value: 70,
  },
  eg: {
    label: 'Extreme Greed',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    barColor: 'bg-green-400',
    fillColor: '#4ade80',
    value: 90,
  },
};

export type RegimeDisplayConfig = (typeof REGIME_DISPLAY_CONFIG)[RegimeId];

/**
 * Regime order for directional calculation.
 * Lower numbers = more bearish, higher numbers = more bullish.
 */
export const REGIME_ORDER: Record<RegimeId, number> = {
  ef: 0,
  f: 1,
  n: 2,
  g: 3,
  eg: 4,
} as const;

/**
 * Default quotes displayed when sentiment data is unavailable.
 */
const DEFAULT_QUOTES: Record<RegimeId, string> = {
  ef: 'Market panic creates opportunities for disciplined investors.',
  f: 'Cautiously increase exposure as sentiment improves.',
  n: 'Maintain balanced position across market cycles.',
  g: 'Market conditions favor aggressive positioning with higher allocation to growth assets.',
  eg: 'Extreme optimism requires caution - protect gains and prepare for reversal.',
};

/**
 * Sentiment value to index mapping.
 * Used for chart normalization (0-100 scale).
 */
export const SENTIMENT_INDEX_MAP: Record<RegimeLabel, number> = {
  extreme_fear: 0,
  fear: 25,
  neutral: 50,
  greed: 75,
  extreme_greed: 100,
};

// =============================================================================
// PURE FUNCTIONS
// =============================================================================

/**
 * Maps a sentiment value (0-100) to the corresponding regime.
 *
 * Sentiment Ranges:
 * - Extreme Fear (ef): 0-25
 * - Fear (f): 26-45
 * - Neutral (n): 46-54
 * - Greed (g): 55-75
 * - Extreme Greed (eg): 76-100
 */
export function getRegimeFromSentiment(sentimentValue: number): RegimeId {
  if (
    !Number.isFinite(sentimentValue) ||
    sentimentValue < 0 ||
    sentimentValue > 100
  ) {
    logger.warn(
      `Invalid sentiment value: ${sentimentValue}. Defaulting to neutral regime.`,
      { sentimentValue },
      'regime',
    );
    return 'n';
  }

  if (sentimentValue <= 25) return 'ef';
  if (sentimentValue <= 45) return 'f';
  if (sentimentValue <= 54) return 'n';
  if (sentimentValue <= 75) return 'g';
  return 'eg';
}

/**
 * Maps a sentiment status string (from API) to the corresponding regime.
 *
 * @param status - The status string from the API (e.g. "Extreme Fear", "Neutral")
 */
export function getRegimeFromStatus(status?: string | null): RegimeId {
  if (!status) {
    return 'n';
  }

  const normalizedStatus = status.toLowerCase().trim();

  switch (normalizedStatus) {
    case 'extreme fear':
      return 'ef';
    case 'fear':
      return 'f';
    case 'neutral':
      return 'n';
    case 'greed':
      return 'g';
    case 'extreme greed':
      return 'eg';
    default:
      logger.warn(
        `Unknown sentiment status: "${status}". Defaulting to neutral regime.`,
        { status },
        'regime',
      );
      return 'n';
  }
}

/**
 * Gets the hex color for a regime.
 *
 * @param regime - Regime ID or label (accepts both formats for compatibility)
 * @param fallback - Fallback color if regime not found (default: yellow-500)
 */
export function getRegimeColor(
  regime: string | null | undefined,
  fallback = '#eab308',
): string {
  if (!regime) return fallback;

  // Try as RegimeId first
  if (regime in REGIME_COLORS) {
    return REGIME_COLORS[regime as RegimeId] ?? fallback;
  }

  // Try as RegimeLabel
  if (regime in LABEL_TO_REGIME_ID) {
    return REGIME_COLORS[LABEL_TO_REGIME_ID[regime as RegimeLabel]] ?? fallback;
  }

  return fallback;
}

/**
 * Gets the human-readable label for a regime.
 *
 * @param regime - Regime ID or label (accepts both formats for compatibility)
 */
export function getRegimeLabel(regime: string | null | undefined): string {
  if (!regime) return '';

  // Try as RegimeId first
  if (regime in REGIME_LABELS) {
    return REGIME_LABELS[regime as RegimeId];
  }

  // Try as RegimeLabel - convert to RegimeId and get label
  if (regime in LABEL_TO_REGIME_ID) {
    return REGIME_LABELS[LABEL_TO_REGIME_ID[regime as RegimeLabel]];
  }

  return '';
}

/**
 * Gets the full display configuration for a regime.
 *
 * @param regime - Regime ID or label
 */
export function getRegimeConfig(
  regime: string | null | undefined,
): RegimeDisplayConfig {
  if (!regime) {
    return REGIME_DISPLAY_CONFIG.n;
  }

  // Try as RegimeId
  if (regime in REGIME_DISPLAY_CONFIG) {
    return REGIME_DISPLAY_CONFIG[regime as RegimeId];
  }

  // Try as RegimeLabel
  if (regime in LABEL_TO_REGIME_ID) {
    return REGIME_DISPLAY_CONFIG[LABEL_TO_REGIME_ID[regime as RegimeLabel]];
  }

  return REGIME_DISPLAY_CONFIG.n;
}

/**
 * Gets the default quote for a regime when sentiment data is unavailable.
 */
export function getDefaultQuoteForRegime(regimeId: RegimeId): string {
  return DEFAULT_QUOTES[regimeId] ?? DEFAULT_QUOTES.n;
}

/**
 * Gets the sentiment index value (0-100) for a regime.
 * Used for chart normalization.
 */
export function getSentimentIndex(regimeLabel: RegimeLabel): number {
  return SENTIMENT_INDEX_MAP[regimeLabel] ?? 50;
}

/* eslint-enable sonarjs/deprecation */
