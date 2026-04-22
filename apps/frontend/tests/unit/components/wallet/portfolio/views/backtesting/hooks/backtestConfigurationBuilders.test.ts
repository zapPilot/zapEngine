import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DAYS,
  DEFAULT_TOTAL_CAPITAL,
  ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
  ETH_BTC_ROTATION_STRATEGY_ID,
} from '@/components/wallet/portfolio/views/backtesting/constants';
import {
  buildCompareConfigForStrategyId,
  buildDefaultPayloadFromPresets,
  buildDefaultPayloadFromStrategies,
  FALLBACK_DEFAULTS,
} from '@/components/wallet/portfolio/views/backtesting/hooks/backtestConfigurationBuilders';
import type { BacktestStrategyCatalogEntryV3 } from '@/types/backtesting';
import type { BacktestDefaults, StrategyPreset } from '@/types/strategy';

function createPreset(
  overrides: Partial<StrategyPreset> & { config_id: string },
): StrategyPreset {
  return {
    config_id: overrides.config_id,
    display_name: 'Test Strategy',
    description: null,
    strategy_id: 'dma_gated_fgi',
    params: {},
    is_default: false,
    is_benchmark: false,
    ...overrides,
  };
}

const TEST_DEFAULTS: BacktestDefaults = { days: 365, total_capital: 50000 };

describe('FALLBACK_DEFAULTS', () => {
  it('uses the configured hard-coded defaults', () => {
    expect(FALLBACK_DEFAULTS.days).toBe(DEFAULT_DAYS);
    expect(FALLBACK_DEFAULTS.total_capital).toBe(DEFAULT_TOTAL_CAPITAL);
  });
});

describe('buildDefaultPayloadFromPresets', () => {
  it('sends only the default preset to minimize backend computation', () => {
    const presets = [
      createPreset({
        config_id: 'dma_gated_fgi_alt',
        strategy_id: 'dma_gated_fgi',
        params: { pacing: { k: 3, r_max: 0.8 } },
      }),
      createPreset({
        config_id: ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
        strategy_id: ETH_BTC_ROTATION_STRATEGY_ID,
        is_default: true,
        params: { pacing: { k: 5, r_max: 1 } },
      }),
    ];

    const result = buildDefaultPayloadFromPresets(presets, TEST_DEFAULTS);

    expect(result).toEqual({
      days: 365,
      total_capital: 50000,
      configs: [
        {
          config_id: ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
          saved_config_id: ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
        },
      ],
    });
  });

  it('deduplicates duplicate preset config ids', () => {
    const presets = [
      createPreset({
        config_id: 'shared_config',
        strategy_id: ETH_BTC_ROTATION_STRATEGY_ID,
        is_default: true,
      }),
      createPreset({
        config_id: 'shared_config',
        strategy_id: ETH_BTC_ROTATION_STRATEGY_ID,
        is_default: false,
      }),
    ];

    const result = buildDefaultPayloadFromPresets(presets, TEST_DEFAULTS);

    expect(result.configs).toHaveLength(1);
    expect(result.configs[0]?.config_id).toBe('shared_config');
  });

  it('falls back to the canonical rotation payload when no presets are available', () => {
    const result = buildDefaultPayloadFromPresets([], TEST_DEFAULTS);

    expect(result.configs).toEqual([
      {
        config_id: ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
        strategy_id: ETH_BTC_ROTATION_STRATEGY_ID,
        params: {},
      },
    ]);
  });

  it('uses the single preset when only one is available', () => {
    const presets = [
      createPreset({
        config_id: 'only_one',
        strategy_id: 'eth_btc_rotation',
        params: { pacing: { k: 2 } },
      }),
    ];

    const result = buildDefaultPayloadFromPresets(presets, TEST_DEFAULTS);

    expect(result.configs).toHaveLength(1);
    expect(result.configs[0]).toEqual({
      config_id: 'only_one',
      saved_config_id: 'only_one',
    });
  });

  it('picks the first preset in original order when none is marked as default', () => {
    const presets = [
      createPreset({
        config_id: 'first_non_default',
        strategy_id: 'dma_gated_fgi',
        params: { pacing: { k: 1 } },
      }),
      createPreset({
        config_id: 'second_non_default',
        strategy_id: 'eth_btc_rotation',
        params: { pacing: { k: 2 } },
      }),
    ];

    const result = buildDefaultPayloadFromPresets(presets, TEST_DEFAULTS);

    expect(result.configs).toHaveLength(1);
    expect(result.configs[0]?.config_id).toBe('first_non_default');
  });

  it('promotes the default preset to first even when it is in the middle of the input', () => {
    const presets = [
      createPreset({
        config_id: 'before',
        strategy_id: 'dma_gated_fgi',
      }),
      createPreset({
        config_id: 'the_default',
        strategy_id: ETH_BTC_ROTATION_STRATEGY_ID,
        is_default: true,
      }),
      createPreset({
        config_id: 'after',
        strategy_id: 'dma_gated_fgi',
      }),
    ];

    const result = buildDefaultPayloadFromPresets(presets, TEST_DEFAULTS);

    expect(result.configs).toHaveLength(1);
    expect(result.configs[0]?.config_id).toBe('the_default');
  });

  it('uses days and total_capital from the provided defaults, not the preset', () => {
    const presets = [
      createPreset({
        config_id: 'x',
        strategy_id: ETH_BTC_ROTATION_STRATEGY_ID,
        is_default: true,
      }),
    ];
    const customDefaults: BacktestDefaults = {
      days: 90,
      total_capital: 99999,
    };

    const result = buildDefaultPayloadFromPresets(presets, customDefaults);

    expect(result.days).toBe(90);
    expect(result.total_capital).toBe(99999);
  });
});

describe('buildDefaultPayloadFromStrategies', () => {
  it('uses FALLBACK_DEFAULTS when no defaults argument provided', () => {
    const result = buildDefaultPayloadFromStrategies(null);

    expect(result.days).toBe(DEFAULT_DAYS);
    expect(result.total_capital).toBe(DEFAULT_TOTAL_CAPITAL);
  });

  it('includes default_params from ethBtcRotation strategy when found', () => {
    const strategies: BacktestStrategyCatalogEntryV3[] = [
      {
        strategy_id: ETH_BTC_ROTATION_STRATEGY_ID,
        display_name: 'ETH/BTC Rotation',
        description: 'Rotates between ETH and BTC',
        param_schema: {},
        default_params: { ratio: 0.5 },
        supports_daily_suggestion: false,
      },
    ];

    const result = buildDefaultPayloadFromStrategies(strategies);

    expect(result.configs[0]).toEqual({
      config_id: ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
      strategy_id: ETH_BTC_ROTATION_STRATEGY_ID,
      params: { ratio: 0.5 },
    });
  });

  it('uses empty object for params when ethBtcRotation is not found', () => {
    const strategies: BacktestStrategyCatalogEntryV3[] = [
      {
        strategy_id: 'dma_gated_fgi',
        display_name: 'DMA Gated FGI',
        description: 'DMA strategy',
        param_schema: {},
        default_params: {},
        supports_daily_suggestion: true,
      },
    ];

    const result = buildDefaultPayloadFromStrategies(strategies);

    expect(result.configs[0]).toEqual({
      config_id: ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
      strategy_id: ETH_BTC_ROTATION_STRATEGY_ID,
      params: {},
    });
  });

  it('handles null strategies array by using empty params', () => {
    const result = buildDefaultPayloadFromStrategies(null);

    expect(result.configs[0]?.params).toEqual({});
  });
});

describe('buildCompareConfigForStrategyId', () => {
  function createPreset(
    overrides: Partial<StrategyPreset> & { config_id: string },
  ): StrategyPreset {
    return {
      config_id: overrides.config_id,
      display_name: 'Test Strategy',
      description: null,
      strategy_id: 'dma_gated_fgi',
      params: {},
      is_default: false,
      is_benchmark: false,
      ...overrides,
    };
  }

  it('returns a preset-backed config when a matching preset is found', () => {
    const presets = [
      createPreset({
        config_id: 'dma_default',
        strategy_id: 'dma_gated_fgi',
        is_default: true,
      }),
    ];

    const result = buildCompareConfigForStrategyId(
      'dma_gated_fgi',
      presets,
      [],
    );

    expect(result).toEqual({
      config_id: 'dma_default',
      saved_config_id: 'dma_default',
    });
  });

  it('prefers the default preset over a non-default one', () => {
    const presets = [
      createPreset({
        config_id: 'dma_alt',
        strategy_id: 'dma_gated_fgi',
        is_default: false,
      }),
      createPreset({
        config_id: 'dma_main',
        strategy_id: 'dma_gated_fgi',
        is_default: true,
      }),
    ];

    const result = buildCompareConfigForStrategyId(
      'dma_gated_fgi',
      presets,
      [],
    );

    expect(result.config_id).toBe('dma_main');
  });

  it('falls back to first matching non-default preset when no default exists', () => {
    const presets = [
      createPreset({
        config_id: 'dma_alt',
        strategy_id: 'dma_gated_fgi',
        is_default: false,
      }),
    ];

    const result = buildCompareConfigForStrategyId(
      'dma_gated_fgi',
      presets,
      [],
    );

    expect(result.config_id).toBe('dma_alt');
  });

  it('returns an adhoc config with default_params when no preset exists but strategy does', () => {
    const strategies: BacktestStrategyCatalogEntryV3[] = [
      {
        strategy_id: 'custom_strategy',
        display_name: 'Custom Strategy',
        description: null,
        param_schema: {},
        default_params: { k: 3 },
        supports_daily_suggestion: false,
      },
    ];

    const result = buildCompareConfigForStrategyId(
      'custom_strategy',
      [],
      strategies,
    );

    expect(result.strategy_id).toBe('custom_strategy');
    expect(result.params).toEqual({ k: 3 });
    expect(result.saved_config_id).toBeUndefined();
  });

  it('returns an adhoc config without params when strategy is not found', () => {
    const result = buildCompareConfigForStrategyId('unknown_strategy', [], []);

    expect(result.strategy_id).toBe('unknown_strategy');
    expect(result.params).toBeUndefined();
  });
});
