import { describe, expect, it } from "vitest";

import {
  parseJsonField,
  updateConfigStrategy,
  updateJsonField,
} from "@/components/wallet/portfolio/views/backtesting/utils/jsonConfigurationHelpers";

describe("parseJsonField", () => {
  it("reads numeric top-level fields", () => {
    expect(parseJsonField('{"days":365}', "days", 500)).toBe(365);
  });

  it("returns fallback for invalid or missing fields", () => {
    expect(parseJsonField("bad json", "days", 500)).toBe(500);
    expect(parseJsonField('{"total_capital":10000}', "days", 500)).toBe(500);
  });
});

describe("updateJsonField", () => {
  it("updates a numeric top-level field", () => {
    const updated = JSON.parse(updateJsonField('{"days":500}', "days", 365));
    expect(updated.days).toBe(365);
  });

  it("returns the original JSON when parsing fails", () => {
    expect(updateJsonField("bad json", "days", 365)).toBe("bad json");
  });
});

describe("updateConfigStrategy", () => {
  it("updates strategy_id on the first config entry", () => {
    const json = JSON.stringify({
      days: 500,
      configs: [
        { config_id: "x", strategy_id: "old", params: { pacing: { k: 1 } } },
      ],
    });
    const result = JSON.parse(updateConfigStrategy(json, "eth_btc_rotation"));
    expect(result.configs[0].strategy_id).toBe("eth_btc_rotation");
    expect(result.configs[0].config_id).toBe("eth_btc_rotation_default");
    expect(result.configs[0].params).toEqual({ pacing: { k: 1 } });
    expect(result.days).toBe(500);
  });

  it("replaces params when defaultParams is provided", () => {
    const json = JSON.stringify({
      configs: [
        { config_id: "x", strategy_id: "old", params: { pacing: { k: 1 } } },
      ],
    });
    const result = JSON.parse(
      updateConfigStrategy(json, "eth_btc_rotation", {
        signal: { cross_cooldown_days: 14 },
      })
    );
    expect(result.configs[0].strategy_id).toBe("eth_btc_rotation");
    expect(result.configs[0].config_id).toBe("eth_btc_rotation_default");
    expect(result.configs[0].params).toEqual({
      signal: { cross_cooldown_days: 14 },
    });
  });

  it("discards other config entries, keeping only the updated one", () => {
    const json = JSON.stringify({
      configs: [
        { config_id: "a", strategy_id: "first" },
        { config_id: "b", strategy_id: "second" },
      ],
    });
    const result = JSON.parse(updateConfigStrategy(json, "changed"));
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0].strategy_id).toBe("changed");
    expect(result.configs[0].config_id).toBe("changed");
  });

  it("returns original JSON on parse failure", () => {
    expect(updateConfigStrategy("bad json", "x")).toBe("bad json");
  });

  it("returns original JSON when configs is empty", () => {
    const json = '{"configs":[]}';
    expect(updateConfigStrategy(json, "x")).toBe(json);
  });

  it("returns original JSON when configs is missing", () => {
    const json = '{"days":500}';
    expect(updateConfigStrategy(json, "x")).toBe(json);
  });

  it("preserves other top-level fields when updating config", () => {
    const json = JSON.stringify({
      days: 500,
      total_capital: 10000,
      configs: [{ config_id: "x", strategy_id: "old" }],
    });

    const result = JSON.parse(updateConfigStrategy(json, "new_strat"));

    expect(result.days).toBe(500);
    expect(result.total_capital).toBe(10000);
    expect(result.configs[0].strategy_id).toBe("new_strat");
  });

  it("synchronizes config_id to the default preset for known strategies", () => {
    const json = JSON.stringify({
      configs: [
        { config_id: "my_config", strategy_id: "old_strat", params: {} },
      ],
    });

    const result = JSON.parse(updateConfigStrategy(json, "dma_gated_fgi"));

    expect(result.configs[0].config_id).toBe("dma_gated_fgi_default");
    expect(result.configs[0].strategy_id).toBe("dma_gated_fgi");
  });

  it("replaces params with empty object when defaultParams is {}", () => {
    const json = JSON.stringify({
      configs: [
        {
          config_id: "x",
          strategy_id: "old",
          params: { pacing: { k: 5, r_max: 1 } },
        },
      ],
    });

    const result = JSON.parse(updateConfigStrategy(json, "new_strat", {}));

    expect(result.configs[0].params).toEqual({});
  });
});
