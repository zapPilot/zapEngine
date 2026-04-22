/**
 * API service for strategy suggestions from analytics-engine.
 *
 * Provides regime-aware allocation recommendations based on market sentiment
 * pattern matching.
 */

import { httpUtils } from '@/lib/http';
import type {
  BacktestDefaults,
  DailySuggestionResponse,
  StrategyConfigsResponse,
  StrategyPreset,
} from '@/types/strategy';

// Re-export types for external use
export type {
  BacktestDefaults,
  DailySuggestionResponse,
  StrategyConfigsResponse,
  StrategyPreset,
};

// =========================================================================
// STRATEGY BOOTSTRAP ENDPOINT
// =========================================================================

/**
 * Get strategy families, public presets, and backtest defaults.
 *
 * Returns the response envelope containing strategies, presets, and
 * backtest_defaults.
 */
export async function getStrategyConfigs(): Promise<StrategyConfigsResponse> {
  const endpoint = `/api/v3/strategy/configs`;
  return httpUtils.analyticsEngine.get<StrategyConfigsResponse>(endpoint);
}

// ============================================================================
// DAILY SUGGESTION ENDPOINT
// ============================================================================

/**
 * Get daily strategy suggestion for a user's portfolio.
 *
 * Returns the current backend-generated recommendation for a preset-backed
 * strategy configuration.
 *
 * **Bucket Mapping:**
 * - spot: Non-stable crypto exposure
 * - stable: Stablecoins (USDC, USDT, DAI, etc.)
 *
 * **Note:** This is a read-only suggestion. No transactions are executed.
 *
 * @param userId - User identifier (UUID)
 * @param configId - Optional preset config_id. When omitted, the backend
 * default preset is used.
 * @returns Daily suggestion response with allocation recommendations
 *
 * @example
 * ```typescript
 * // Get the backend default suggestion
 * const suggestion = await getDailySuggestion('user-123');
 *
 * // Get suggestion for a specific preset
 * const suggestion = await getDailySuggestion('user-123', 'dma_gated_fgi_default');
 *
 * // Inspect whether any user action is required
 * console.log(suggestion.action.status, suggestion.context.target.allocation);
 * ```
 */
export async function getDailySuggestion(
  userId: string,
  configId?: string,
): Promise<DailySuggestionResponse> {
  const query = configId
    ? new URLSearchParams({ config_id: configId }).toString()
    : '';
  const endpoint = `/api/v3/strategy/daily-suggestion/${userId}${query ? `?${query}` : ''}`;
  return httpUtils.analyticsEngine.get<DailySuggestionResponse>(endpoint);
}
