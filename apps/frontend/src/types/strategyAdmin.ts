/**
 * Types for the Strategy Admin Config Manager.
 *
 * These types mirror the backend Pydantic models in
 * analytics-engine/src/models/strategy_admin.py
 */

import type { BacktestCompareParamsV3 } from './backtesting';

/**
 * Reference to a strategy component with its parameters.
 */
export interface StrategyComponentRef {
  component_id: string;
  params: Record<string, unknown>;
}

/**
 * Strategy composition — defines signal, decision, pacing, execution, and plugins.
 */
export interface StrategyComposition {
  kind: string;
  bucket_mapper_id: string;
  signal: StrategyComponentRef;
  decision_policy: StrategyComponentRef;
  pacing_policy: StrategyComponentRef;
  execution_profile: StrategyComponentRef;
  plugins: StrategyComponentRef[];
}

/**
 * A saved strategy configuration returned by the admin API.
 */
export interface SavedStrategyConfig {
  config_id: string;
  display_name: string;
  description: string | null;
  strategy_id: string;
  primary_asset: string;
  supports_daily_suggestion: boolean;
  is_default: boolean;
  is_benchmark: boolean;
  params: BacktestCompareParamsV3;
  composition: StrategyComposition;
}

/**
 * Response envelope for listing all admin configs.
 */
export interface StrategyAdminConfigsResponse {
  configs: SavedStrategyConfig[];
}

/**
 * Response envelope for a single admin config.
 */
export interface StrategyAdminConfigResponse {
  config: SavedStrategyConfig;
}

/**
 * Shared fields for create/update strategy config requests.
 */
interface StrategyConfigRequestBase {
  display_name: string;
  description: string | null;
  strategy_id: string;
  primary_asset: string;
  supports_daily_suggestion: boolean;
  params: BacktestCompareParamsV3;
  composition: StrategyComposition;
}

/**
 * Request body for creating a new strategy config.
 * Excludes server-managed fields (is_default, is_benchmark).
 */
export interface CreateStrategyConfigRequest extends StrategyConfigRequestBase {
  config_id: string;
}

/**
 * Request body for updating an existing strategy config.
 * Same fields as create (config_id is in the URL, not the body).
 */
export type UpdateStrategyConfigRequest = StrategyConfigRequestBase;
