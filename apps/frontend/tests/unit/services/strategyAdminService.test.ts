import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { httpUtils } from "@/lib/http";
import {
  createStrategyConfig,
  getStrategyAdminConfig,
  getStrategyAdminConfigs,
  setDefaultStrategyConfig,
  updateStrategyConfig,
} from "@/services/strategyAdminService";
import type {
  CreateStrategyConfigRequest,
  SavedStrategyConfig,
  StrategyAdminConfigResponse,
  StrategyAdminConfigsResponse,
  StrategyComposition,
  UpdateStrategyConfigRequest,
} from "@/types/strategyAdmin";

const getSpy = vi.spyOn(httpUtils.analyticsEngine, "get");
const postSpy = vi.spyOn(httpUtils.analyticsEngine, "post");
const putSpy = vi.spyOn(httpUtils.analyticsEngine, "put");

function createMockComposition(
  overrides: Partial<StrategyComposition> = {}
): StrategyComposition {
  return {
    kind: "bucket_strategy",
    bucket_mapper_id: "spot_stable",
    signal: { component_id: "dma_gated_fgi_signal", params: {} },
    decision_policy: { component_id: "fgi_tiered_decision", params: {} },
    pacing_policy: { component_id: "weekly_pacing", params: {} },
    execution_profile: { component_id: "single_asset_execution", params: {} },
    plugins: [],
    ...overrides,
  };
}

function createMockConfig(
  overrides: Partial<SavedStrategyConfig> = {}
): SavedStrategyConfig {
  return {
    config_id: "test_config",
    display_name: "Test Config",
    description: "A test config",
    strategy_id: "dma_gated_fgi",
    primary_asset: "BTC",
    supports_daily_suggestion: true,
    is_default: false,
    is_benchmark: false,
    params: { signal: { cross_cooldown_days: 30 } },
    composition: createMockComposition(),
    ...overrides,
  };
}

describe("strategyAdminService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSpy.mockReset();
    postSpy.mockReset();
    putSpy.mockReset();
  });

  afterAll(() => {
    getSpy.mockRestore();
    postSpy.mockRestore();
    putSpy.mockRestore();
  });

  describe("getStrategyAdminConfigs", () => {
    it("calls the correct endpoint", async () => {
      const response: StrategyAdminConfigsResponse = {
        configs: [createMockConfig()],
      };
      getSpy.mockResolvedValue(response);

      const result = await getStrategyAdminConfigs();

      expect(getSpy).toHaveBeenCalledWith("/api/v3/strategy/admin/configs");
      expect(result.configs).toHaveLength(1);
    });

    it("propagates errors", async () => {
      getSpy.mockRejectedValue(new Error("Network error"));

      await expect(getStrategyAdminConfigs()).rejects.toThrow();
    });
  });

  describe("getStrategyAdminConfig", () => {
    it("calls the correct endpoint with encoded config ID", async () => {
      const response: StrategyAdminConfigResponse = {
        config: createMockConfig(),
      };
      getSpy.mockResolvedValue(response);

      const result = await getStrategyAdminConfig("test_config");

      expect(getSpy).toHaveBeenCalledWith(
        "/api/v3/strategy/admin/configs/test_config"
      );
      expect(result.config.config_id).toBe("test_config");
    });
  });

  describe("createStrategyConfig", () => {
    it("POSTs to the correct endpoint", async () => {
      const body: CreateStrategyConfigRequest = {
        config_id: "new_config",
        display_name: "New Config",
        description: null,
        strategy_id: "dma_gated_fgi",
        primary_asset: "BTC",
        supports_daily_suggestion: false,
        params: {},
        composition: createMockComposition(),
      };
      const response: StrategyAdminConfigResponse = {
        config: createMockConfig({ config_id: "new_config" }),
      };
      postSpy.mockResolvedValue(response);

      const result = await createStrategyConfig(body);

      expect(postSpy).toHaveBeenCalledWith(
        "/api/v3/strategy/admin/configs",
        body
      );
      expect(result.config.config_id).toBe("new_config");
    });
  });

  describe("updateStrategyConfig", () => {
    it("PUTs to the correct endpoint", async () => {
      const body: UpdateStrategyConfigRequest = {
        display_name: "Updated Name",
        description: "Updated desc",
        strategy_id: "dma_gated_fgi",
        primary_asset: "BTC",
        supports_daily_suggestion: true,
        params: { signal: { cross_cooldown_days: 21 } },
        composition: createMockComposition(),
      };
      const response: StrategyAdminConfigResponse = {
        config: createMockConfig({ display_name: "Updated Name" }),
      };
      putSpy.mockResolvedValue(response);

      const result = await updateStrategyConfig("test_config", body);

      expect(putSpy).toHaveBeenCalledWith(
        "/api/v3/strategy/admin/configs/test_config",
        body
      );
      expect(result.config.display_name).toBe("Updated Name");
    });
  });

  describe("setDefaultStrategyConfig", () => {
    it("POSTs to the set-default endpoint", async () => {
      const response: StrategyAdminConfigResponse = {
        config: createMockConfig({ is_default: true }),
      };
      postSpy.mockResolvedValue(response);

      const result = await setDefaultStrategyConfig("test_config");

      expect(postSpy).toHaveBeenCalledWith(
        "/api/v3/strategy/admin/configs/test_config/set-default",
        {}
      );
      expect(result.config.is_default).toBe(true);
    });
  });
});
