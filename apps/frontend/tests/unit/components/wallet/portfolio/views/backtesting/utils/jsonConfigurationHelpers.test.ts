import { describe, expect, it } from 'vitest';

import {
  parseJsonField,
  parseSelectedConfigId,
  updateConfigStrategy,
  updateJsonField,
} from '@/components/wallet/portfolio/views/backtesting/utils/jsonConfigurationHelpers';
import type { StrategyPreset } from '@/types/strategy';

const PRESETS: StrategyPreset[] = [
  {
    config_id: 'dma_fgi_portfolio_rules_default',
    display_name: 'DMA/FGI Portfolio Rules',
    description: null,
    strategy_id: 'dma_fgi_portfolio_rules',
    params: {},
    is_default: true,
    is_benchmark: false,
  },
  {
    config_id: 'dma_fgi_portfolio_rules_optimized',
    display_name: 'DMA/FGI Portfolio Rules (Optimized)',
    description: null,
    strategy_id: 'dma_fgi_portfolio_rules',
    params: {},
    is_default: false,
    is_benchmark: false,
  },
];

describe('parseSelectedConfigId', () => {
  it('returns the saved_config_id of the first non-DCA compare config', () => {
    const json = JSON.stringify({
      configs: [
        { config_id: 'dca_classic', strategy_id: 'dca_classic', params: {} },
        {
          config_id: 'dma_fgi_portfolio_rules_optimized',
          saved_config_id: 'dma_fgi_portfolio_rules_optimized',
        },
      ],
    });
    expect(parseSelectedConfigId(json, 'fallback', PRESETS)).toBe(
      'dma_fgi_portfolio_rules_optimized',
    );
  });

  it('distinguishes presets that share a strategy_id by config_id', () => {
    const defaultJson = JSON.stringify({
      configs: [
        {
          config_id: 'dma_fgi_portfolio_rules_default',
          saved_config_id: 'dma_fgi_portfolio_rules_default',
        },
      ],
    });
    const optimizedJson = JSON.stringify({
      configs: [
        {
          config_id: 'dma_fgi_portfolio_rules_optimized',
          saved_config_id: 'dma_fgi_portfolio_rules_optimized',
        },
      ],
    });
    expect(parseSelectedConfigId(defaultJson, 'fallback', PRESETS)).toBe(
      'dma_fgi_portfolio_rules_default',
    );
    expect(parseSelectedConfigId(optimizedJson, 'fallback', PRESETS)).toBe(
      'dma_fgi_portfolio_rules_optimized',
    );
  });

  it('falls back to config_id for adhoc strategy configs', () => {
    const json = JSON.stringify({
      configs: [
        {
          config_id: 'my_adhoc',
          strategy_id: 'dma_fgi_portfolio_rules',
          params: {},
        },
      ],
    });
    expect(parseSelectedConfigId(json, 'fallback', [])).toBe('my_adhoc');
  });

  it('returns the fallback for invalid or empty payloads', () => {
    expect(parseSelectedConfigId('bad json', 'fallback', PRESETS)).toBe(
      'fallback',
    );
    expect(parseSelectedConfigId('{"configs":[]}', 'fallback', PRESETS)).toBe(
      'fallback',
    );
  });

  it('returns the only DCA config_id when no other config is present', () => {
    const json = JSON.stringify({
      configs: [
        { config_id: 'dca_classic', strategy_id: 'dca_classic', params: {} },
      ],
    });
    expect(parseSelectedConfigId(json, 'fallback', PRESETS)).toBe(
      'dca_classic',
    );
  });
});

describe('parseJsonField', () => {
  it('reads numeric top-level fields', () => {
    expect(parseJsonField('{"days":365}', 'days', 500)).toBe(365);
  });

  it('returns fallback for invalid or missing fields', () => {
    expect(parseJsonField('bad json', 'days', 500)).toBe(500);
    expect(parseJsonField('{"total_capital":10000}', 'days', 500)).toBe(500);
  });
});

describe('updateJsonField', () => {
  it('updates a numeric top-level field', () => {
    const updated = JSON.parse(updateJsonField('{"days":500}', 'days', 365));
    expect(updated.days).toBe(365);
  });

  it('returns the original JSON when parsing fails', () => {
    expect(updateJsonField('bad json', 'days', 365)).toBe('bad json');
  });
});

describe('updateConfigStrategy', () => {
  it('updates strategy_id on the first config entry', () => {
    const json = JSON.stringify({
      days: 500,
      configs: [
        { config_id: 'x', strategy_id: 'old', params: { pacing: { k: 1 } } },
      ],
    });
    const result = JSON.parse(
      updateConfigStrategy(json, 'dma_fgi_portfolio_rules'),
    );
    expect(result.configs[0].strategy_id).toBe('dma_fgi_portfolio_rules');
    expect(result.configs[0].config_id).toBe('dma_fgi_portfolio_rules_default');
    expect(result.configs[0].params).toEqual({ pacing: { k: 1 } });
    expect(result.days).toBe(500);
  });

  it('replaces params when defaultParams is provided', () => {
    const json = JSON.stringify({
      configs: [
        { config_id: 'x', strategy_id: 'old', params: { pacing: { k: 1 } } },
      ],
    });
    const result = JSON.parse(
      updateConfigStrategy(json, 'dma_fgi_portfolio_rules', {
        signal: { cross_cooldown_days: 14 },
      }),
    );
    expect(result.configs[0].strategy_id).toBe('dma_fgi_portfolio_rules');
    expect(result.configs[0].config_id).toBe('dma_fgi_portfolio_rules_default');
    expect(result.configs[0].params).toEqual({
      signal: { cross_cooldown_days: 14 },
    });
  });

  it('discards other config entries, keeping only the updated one', () => {
    const json = JSON.stringify({
      configs: [
        { config_id: 'a', strategy_id: 'first' },
        { config_id: 'b', strategy_id: 'second' },
      ],
    });
    const result = JSON.parse(updateConfigStrategy(json, 'changed'));
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0].strategy_id).toBe('changed');
    expect(result.configs[0].config_id).toBe('changed');
  });

  it('returns original JSON on parse failure', () => {
    expect(updateConfigStrategy('bad json', 'x')).toBe('bad json');
  });

  it('returns original JSON when configs is empty', () => {
    const json = '{"configs":[]}';
    expect(updateConfigStrategy(json, 'x')).toBe(json);
  });

  it('returns original JSON when configs is missing', () => {
    const json = '{"days":500}';
    expect(updateConfigStrategy(json, 'x')).toBe(json);
  });

  it('preserves other top-level fields when updating config', () => {
    const json = JSON.stringify({
      days: 500,
      total_capital: 10000,
      configs: [{ config_id: 'x', strategy_id: 'old' }],
    });

    const result = JSON.parse(updateConfigStrategy(json, 'new_strat'));

    expect(result.days).toBe(500);
    expect(result.total_capital).toBe(10000);
    expect(result.configs[0].strategy_id).toBe('new_strat');
  });

  it('synchronizes config_id to the default preset for known strategies', () => {
    const json = JSON.stringify({
      configs: [
        { config_id: 'my_config', strategy_id: 'old_strat', params: {} },
      ],
    });

    const result = JSON.parse(
      updateConfigStrategy(json, 'dma_fgi_portfolio_rules'),
    );

    expect(result.configs[0].config_id).toBe('dma_fgi_portfolio_rules_default');
    expect(result.configs[0].strategy_id).toBe('dma_fgi_portfolio_rules');
  });

  it('replaces params with empty object when defaultParams is {}', () => {
    const json = JSON.stringify({
      configs: [
        {
          config_id: 'x',
          strategy_id: 'old',
          params: { pacing: { k: 5, r_max: 1 } },
        },
      ],
    });

    const result = JSON.parse(updateConfigStrategy(json, 'new_strat', {}));

    expect(result.configs[0].params).toEqual({});
  });
});

describe('parseJsonField edge cases', () => {
  it('returns fallback for non-numeric field values', () => {
    expect(parseJsonField('{"days":"not_a_number"}', 'days', 500)).toBe(500);
    expect(parseJsonField('{"days":null}', 'days', 500)).toBe(500);
    expect(parseJsonField('{"days":undefined}', 'days', 500)).toBe(500);
    expect(parseJsonField('{"days":true}', 'days', 500)).toBe(500);
  });

  it('returns fallback for arrays and objects in field', () => {
    expect(parseJsonField('{"days":[1,2,3]}', 'days', 500)).toBe(500);
    expect(parseJsonField('{"days":{"nested":true}}', 'days', 500)).toBe(500);
  });

  it('handles negative numbers correctly', () => {
    expect(parseJsonField('{"days":-30}', 'days', 500)).toBe(-30);
  });

  it('handles floating point numbers', () => {
    expect(parseJsonField('{"days":3.14}', 'days', 500)).toBe(3.14);
  });

  it('handles zero value correctly', () => {
    expect(parseJsonField('{"days":0}', 'days', 500)).toBe(0);
  });
});

describe('parseJsonField invalid JSON', () => {
  it('returns fallback for invalid JSON strings', () => {
    expect(parseJsonField('{invalid json}', 'days', 500)).toBe(500);
    expect(parseJsonField('', 'days', 500)).toBe(500);
    expect(parseJsonField('not json at all', 'days', 500)).toBe(500);
  });

  it('returns fallback when field is missing', () => {
    expect(parseJsonField('{"other_field":100}', 'days', 500)).toBe(500);
  });
});

describe('updateJsonField edge cases', () => {
  it('updates numeric field to zero', () => {
    const result = JSON.parse(updateJsonField('{"days":500}', 'days', 0));
    expect(result.days).toBe(0);
  });

  it('updates negative numbers', () => {
    const result = JSON.parse(updateJsonField('{"days":500}', 'days', -30));
    expect(result.days).toBe(-30);
  });

  it('updates floating point numbers', () => {
    const result = JSON.parse(updateJsonField('{"days":500}', 'days', 3.14));
    expect(result.days).toBe(3.14);
  });

  it('preserves existing fields when updating', () => {
    const result = JSON.parse(
      updateJsonField('{"days":500,"other":100}', 'days', 365),
    );
    expect(result.days).toBe(365);
    expect(result.other).toBe(100);
  });

  it('returns original when JSON has syntax error', () => {
    expect(updateJsonField('{broken json}', 'days', 365)).toBe('{broken json}');
  });

  it('adds field when field does not exist', () => {
    const original = '{"other_field":100}';
    const result = JSON.parse(updateJsonField(original, 'missing_field', 365));
    expect(result.other_field).toBe(100);
    expect(result.missing_field).toBe(365);
  });
});

describe('updateConfigStrategy edge cases', () => {
  it('handles config with null params', () => {
    const json = JSON.stringify({
      configs: [{ config_id: 'x', strategy_id: 'old', params: null }],
    });
    const result = JSON.parse(updateConfigStrategy(json, 'new_strat'));
    expect(result.configs[0].strategy_id).toBe('new_strat');
    expect(result.configs[0].params).toBe(null);
  });

  it('handles config with undefined params', () => {
    const json = JSON.stringify({
      configs: [{ config_id: 'x', strategy_id: 'old' }],
    });
    const result = JSON.parse(updateConfigStrategy(json, 'new_strat'));
    expect(result.configs[0].params).toBeUndefined();
  });

  it('handles JSON with trailing whitespace', () => {
    const json =
      '{"days":500,"configs":[{"config_id":"x","strategy_id":"old"}]}  ';
    const result = JSON.parse(updateConfigStrategy(json, 'new_strat'));
    expect(result.configs[0].strategy_id).toBe('new_strat');
  });

  it('handles JSON with newlines', () => {
    const json = `{
      "days": 500,
      "configs": [{"config_id": "x", "strategy_id": "old"}]
    }`;
    const result = JSON.parse(updateConfigStrategy(json, 'new_strat'));
    expect(result.configs[0].strategy_id).toBe('new_strat');
  });

  it('returns original JSON when configs is not an array', () => {
    const json = '{"configs":"not_an_array"}';
    expect(updateConfigStrategy(json, 'x')).toBe(json);
  });

  it('returns original JSON when configs is null', () => {
    const json = '{"configs":null}';
    expect(updateConfigStrategy(json, 'x')).toBe(json);
  });
});
