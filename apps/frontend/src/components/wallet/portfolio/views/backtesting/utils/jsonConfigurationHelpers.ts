import type { BacktestRequest } from '@/types/backtesting';
import type { StrategyPreset } from '@/types/strategy';

import {
  DCA_CLASSIC_STRATEGY_ID,
  getDefaultConfigIdForStrategyId,
} from '../constants';

function parseJsonObject(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Parse JSON and extract the `configs` array, returning null when either is invalid.
 */
function parseJsonConfigs(
  json: string,
): { parsed: Record<string, unknown>; configs: unknown[] } | null {
  const parsed = parseJsonObject(json);
  if (!parsed) {
    return null;
  }

  const configs = parsed['configs'];
  if (!Array.isArray(configs) || configs.length === 0) {
    return null;
  }

  return { parsed, configs };
}

function withParsedConfigs(
  json: string,
  onSuccess: (parsed: Record<string, unknown>, configs: unknown[]) => string,
): string {
  const result = parseJsonConfigs(json);
  if (!result) {
    return json;
  }

  return onSuccess(result.parsed, result.configs);
}

/**
 * Parse a numeric field from the JSON editor value string.
 * Returns `fallback` when the JSON is invalid or the key is missing.
 *
 * @param json - Raw JSON string from the editor
 * @param key - Top-level field name to read
 * @param fallback - Default value when parsing fails
 * @returns The numeric value or fallback
 *
 * @example
 * ```ts
 * parseJsonField('{"days": 500}', "days", 365) // => 500
 * parseJsonField('invalid', "days", 365)        // => 365
 * ```
 */
export function parseJsonField(
  json: string,
  key: string,
  fallback: number,
): number {
  const parsed = parseJsonObject(json);
  if (!parsed) {
    return fallback;
  }

  const value = parsed[key];
  return typeof value === 'number' ? value : fallback;
}

/**
 * Update a single numeric field inside the JSON editor value and return
 * the new JSON string. Preserves all other fields.
 *
 * @param json - Raw JSON string from the editor
 * @param key - Top-level field name to update
 * @param value - New numeric value
 * @returns Updated JSON string, or the original on parse failure
 *
 * @example
 * ```ts
 * updateJsonField('{"days": 500}', "days", 365)
 * // => '{\n  "days": 365\n}'
 * ```
 */
export function updateJsonField(
  json: string,
  key: string,
  value: number,
): string {
  const parsed = parseJsonObject(json);
  if (!parsed) {
    return json;
  }

  parsed[key] = value;
  return JSON.stringify(parsed, null, 2);
}

/**
 * Resolve the selected preset config_id from the editor JSON. Selection is
 * config-level (not strategy-level) so distinct presets sharing a strategy_id
 * — e.g. the default and the optimized DMA/FGI configs — are each selectable.
 *
 * Reads the first compare config whose resolved strategy_id is not DCA Classic,
 * preferring its `saved_config_id`, then its `config_id`. Adhoc configs (raw
 * `strategy_id` + params) fall back to their `config_id`. Returns `fallback`
 * when nothing resolves.
 */
export function parseSelectedConfigId(
  json: string,
  fallback: string,
  presets: StrategyPreset[],
): string {
  const result = parseJsonConfigs(json);
  if (!result) {
    return fallback;
  }

  let firstResolvedConfigId: string | null = null;

  for (const entry of result.configs) {
    const config = entry as Record<string, unknown> | undefined;
    const savedConfigId = config?.['saved_config_id'];
    const configId = config?.['config_id'];
    const strategyId = config?.['strategy_id'];

    const resolvedConfigId =
      typeof savedConfigId === 'string'
        ? savedConfigId
        : typeof configId === 'string'
          ? configId
          : undefined;
    if (!resolvedConfigId) {
      continue;
    }

    // Resolve the strategy behind this entry to skip the DCA baseline line.
    const preset = presets.find((item) => item.config_id === resolvedConfigId);
    const resolvedStrategyId =
      preset?.strategy_id ??
      (typeof strategyId === 'string' ? strategyId : undefined);

    firstResolvedConfigId ??= resolvedConfigId;
    if (resolvedStrategyId !== DCA_CLASSIC_STRATEGY_ID) {
      return resolvedConfigId;
    }
  }

  return firstResolvedConfigId ?? fallback;
}

/**
 * Replace the first compare config entry while preserving other top-level
 * fields. Always produces a single config entry.
 *
 * @param json - Raw JSON string from the editor
 * @param config - New compare config entry to set
 * @returns Updated JSON string, or the original on parse failure
 *
 * @example
 * ```ts
 * updateConfigStrategy(
 *   '{"configs":[{"config_id":"x","strategy_id":"old"}]}',
 *   { config_id: "dma_fgi_portfolio_rules_default", saved_config_id: "dma_fgi_portfolio_rules_default" }
 * )
 * ```
 */
export function updateConfigStrategy(
  json: string,
  configOrStrategyId: BacktestRequest['configs'][number] | string,
  defaultParams?: BacktestRequest['configs'][number]['params'],
): string {
  return withParsedConfigs(json, (parsed, configs) => {
    const existingFirst = configs[0] as Record<string, unknown> | undefined;
    let config: BacktestRequest['configs'][number];
    if (typeof configOrStrategyId === 'string') {
      config = {
        config_id: getDefaultConfigIdForStrategyId(configOrStrategyId),
        strategy_id: configOrStrategyId,
      };
      const preservedParams =
        defaultParams ??
        (existingFirst?.['params'] as
          | BacktestRequest['configs'][number]['params']
          | undefined);
      if (preservedParams !== undefined) {
        config = { ...config, params: preservedParams };
      }
    } else {
      config = configOrStrategyId;
    }

    const first: Record<string, unknown> = {
      config_id: config.config_id,
    };
    if (config.saved_config_id !== undefined) {
      first['saved_config_id'] = config.saved_config_id;
    }
    if (config.strategy_id !== undefined) {
      first['strategy_id'] = config.strategy_id;
    }
    if (config.params !== undefined) {
      first['params'] = config.params;
    }

    parsed['configs'] = [first];
    return JSON.stringify(parsed, null, 2);
  });
}

export function normalizePresetBackedConfigs(
  json: string,
  presets: StrategyPreset[],
): string {
  return withParsedConfigs(json, (parsed, configs) => {
    let changed = false;
    parsed['configs'] = configs.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }

      const config = { ...(entry as Record<string, unknown>) };
      const savedConfigId = config['saved_config_id'];
      const hasPresetReference = typeof savedConfigId === 'string';
      const hasInlineParams = config['params'] !== undefined;
      if (!hasPresetReference || !hasInlineParams) {
        return config;
      }

      const preset = presets.find((item) => item.config_id === savedConfigId);
      if (!preset) {
        return config;
      }

      delete config['saved_config_id'];
      config['strategy_id'] = preset.strategy_id;
      changed = true;
      return config;
    });

    return changed ? JSON.stringify(parsed, null, 2) : json;
  });
}
