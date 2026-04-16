/**
 * Admin API service for managing saved strategy configurations.
 *
 * Provides CRUD operations against the `/api/v3/strategy/admin/configs` endpoints.
 */

import { httpUtils } from "@/lib/http";
import { createApiServiceCaller } from "@/lib/http/createServiceCaller";
import type {
  CreateStrategyConfigRequest,
  StrategyAdminConfigResponse,
  StrategyAdminConfigsResponse,
  UpdateStrategyConfigRequest,
} from "@/types/strategyAdmin";

const callAdminApi = createApiServiceCaller(
  {
    400: "Invalid configuration. Please review your inputs.",
    404: "Strategy configuration not found.",
    409: "Conflict — this configuration is read-only or violates a constraint.",
  },
  "Strategy admin request failed"
);

/**
 * List all saved strategy configurations.
 *
 * @returns All admin configs
 *
 * @example
 * ```typescript
 * const { configs } = await getStrategyAdminConfigs();
 * ```
 */
export async function getStrategyAdminConfigs(): Promise<StrategyAdminConfigsResponse> {
  return callAdminApi(() =>
    httpUtils.analyticsEngine.get<StrategyAdminConfigsResponse>(
      "/api/v3/strategy/admin/configs"
    )
  );
}

/**
 * Get a single saved strategy configuration by ID.
 *
 * @param configId - The config_id to fetch
 * @returns The config wrapped in a response envelope
 *
 * @example
 * ```typescript
 * const { config } = await getStrategyAdminConfig("dma_gated_fgi_default");
 * ```
 */
export async function getStrategyAdminConfig(
  configId: string
): Promise<StrategyAdminConfigResponse> {
  return callAdminApi(() =>
    httpUtils.analyticsEngine.get<StrategyAdminConfigResponse>(
      `/api/v3/strategy/admin/configs/${encodeURIComponent(configId)}`
    )
  );
}

/**
 * Create a new saved strategy configuration.
 *
 * @param body - The config fields (config_id included in body)
 * @returns The created config
 *
 * @example
 * ```typescript
 * const { config } = await createStrategyConfig({
 *   config_id: "my_new_config",
 *   display_name: "My New Config",
 *   ...
 * });
 * ```
 */
export async function createStrategyConfig(
  body: CreateStrategyConfigRequest
): Promise<StrategyAdminConfigResponse> {
  return callAdminApi(() =>
    httpUtils.analyticsEngine.post<StrategyAdminConfigResponse>(
      "/api/v3/strategy/admin/configs",
      body
    )
  );
}

/**
 * Update an existing saved strategy configuration.
 *
 * @param configId - The config_id to update
 * @param body - The updated config fields
 * @returns The updated config
 *
 * @example
 * ```typescript
 * const { config } = await updateStrategyConfig("my_config", {
 *   display_name: "Updated Name",
 *   ...
 * });
 * ```
 */
export async function updateStrategyConfig(
  configId: string,
  body: UpdateStrategyConfigRequest
): Promise<StrategyAdminConfigResponse> {
  return callAdminApi(() =>
    httpUtils.analyticsEngine.put<StrategyAdminConfigResponse>(
      `/api/v3/strategy/admin/configs/${encodeURIComponent(configId)}`,
      body
    )
  );
}

/**
 * Set a configuration as the default for daily suggestions.
 *
 * @param configId - The config_id to set as default
 * @returns The updated config
 *
 * @example
 * ```typescript
 * const { config } = await setDefaultStrategyConfig("dma_gated_fgi_aggressive");
 * ```
 */
export async function setDefaultStrategyConfig(
  configId: string
): Promise<StrategyAdminConfigResponse> {
  return callAdminApi(() =>
    httpUtils.analyticsEngine.post<StrategyAdminConfigResponse>(
      `/api/v3/strategy/admin/configs/${encodeURIComponent(configId)}/set-default`,
      {}
    )
  );
}
