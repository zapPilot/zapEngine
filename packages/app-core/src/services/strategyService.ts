/**
 * API service for strategy suggestions from analytics-engine.
 *
 * Provides regime-aware allocation recommendations based on market sentiment
 * pattern matching.
 */

import { httpUtils } from '@core/lib/http';
import { reportHandledError } from '@core/lib/observability/errorReporter';
import { findDailySuggestionSchemaIssues } from '@core/schemas/api/strategySchemas';
import type {
  BacktestDefaults,
  DailySuggestionResponse,
  StrategyConfigsResponse,
  StrategyPreset,
} from '@core/types/strategy';

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
 * const suggestion = await getDailySuggestion('user-123', 'dma_fgi_portfolio_rules_default');
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
  // Suggestion composition aggregates the whole bundle — same cold-cache
  // budget as the per-user analytics endpoints.
  const response = await httpUtils.analyticsEngine.get<DailySuggestionResponse>(
    endpoint,
    { timeout: 60_000 },
  );

  // Observe-only, deliberately: the schema has never run against live traffic
  // and is stricter than the backend, so rejecting here could blank the
  // strategy card for a payload the backend considers valid. Only the mismatch
  // shape travels — the payload is the user's financial position.
  const schemaIssues = findDailySuggestionSchemaIssues(response);
  if (schemaIssues.length > 0) {
    reportHandledError(
      new Error('daily suggestion response does not match the wire schema'),
      {
        scope: 'strategyService.getDailySuggestion',
        extra: { issues: schemaIssues },
      },
    );
  }

  return response;
}
