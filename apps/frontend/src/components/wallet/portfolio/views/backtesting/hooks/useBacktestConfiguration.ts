import { useBacktestMutation } from '@zapengine/app-core/hooks/mutations/useBacktestMutation';
import { getStrategyConfigs } from '@zapengine/app-core/services';
import type { BacktestRequest } from '@zapengine/app-core/types/backtesting';
import type { StrategyConfigsResponse } from '@zapengine/app-core/types/strategy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DCA_CLASSIC_STRATEGY_ID,
  DEFAULT_DAYS,
  DMA_FGI_PORTFOLIO_RULES_DEFAULT_CONFIG_ID,
} from '../constants';
import {
  normalizePresetBackedConfigs,
  parseJsonField,
  parseSelectedConfigId,
} from '../utils/jsonConfigurationHelpers';
import {
  buildDefaultPayloadFromPresets,
  buildDefaultPayloadFromStrategies,
  FALLBACK_DEFAULTS,
} from './backtestConfigurationBuilders';
import {
  backtestRequestSchema,
  formatValidationError,
  normalizeParams,
  type ParsedBacktestRequest,
  validateConfigsStrategyIdsAgainstCatalog,
} from './backtestRequestValidation';

/**
 * Serialize the default editor JSON from strategy configs. Prefers curated
 * presets when present and otherwise falls back to the live-strategy payload.
 * Used for the initial editor value, the post-fetch hydration, and reset.
 */
function buildDefaultEditorValue(
  configs: StrategyConfigsResponse | null,
): string {
  const defaults = configs?.backtest_defaults ?? FALLBACK_DEFAULTS;
  const payload =
    configs && configs.presets.length > 0
      ? buildDefaultPayloadFromPresets(configs.presets, defaults)
      : buildDefaultPayloadFromStrategies(
          configs?.strategies ?? null,
          defaults,
        );
  return JSON.stringify(payload, null, 2);
}

export function useBacktestConfiguration() {
  const {
    mutate,
    data: backtestData,
    isPending,
    error,
  } = useBacktestMutation();

  const [strategyConfigs, setStrategyConfigs] =
    useState<StrategyConfigsResponse | null>(null);
  const [editorValue, setEditorValue] = useState<string>(() =>
    buildDefaultEditorValue(null),
  );
  const [editorError, setEditorError] = useState<string | null>(null);
  const [defaultsReady, setDefaultsReady] = useState(false);
  const [initialRunSettled, setInitialRunSettled] = useState(false);
  const userEdited = useRef(false);
  const initialRunStarted = useRef(false);

  // Fetch strategy bootstrap data once on mount.
  useEffect(() => {
    let cancelled = false;

    const fetchDefaults = async () => {
      const [configsResult] = await Promise.allSettled([getStrategyConfigs()]);
      if (cancelled) return;

      if (configsResult.status === 'fulfilled') {
        const configs = configsResult.value;
        setStrategyConfigs(configs);
        if (!userEdited.current) {
          setEditorValue(buildDefaultEditorValue(configs));
        }
      }

      setDefaultsReady(true);
    };

    void fetchDefaults();

    return () => {
      cancelled = true;
    };
  }, []);

  const parsedEditorPayload = useMemo(() => {
    try {
      return JSON.parse(editorValue) as unknown;
    } catch {
      return null;
    }
  }, [editorValue]);

  const submitBacktest = useCallback(
    (
      parsedData: ParsedBacktestRequest,
      options?: Parameters<typeof mutate>[1],
    ) => {
      const configs: BacktestRequest['configs'] = parsedData.configs.map(
        (cfg) => {
          if (cfg.saved_config_id) {
            return {
              config_id: cfg.config_id,
              saved_config_id: cfg.saved_config_id,
            };
          }
          const strategyId = cfg.strategy_id;
          if (!strategyId) {
            throw new Error(
              'Backtest compare config is missing strategy_id for ad-hoc request',
            );
          }
          const params = normalizeParams(cfg.params);
          return {
            config_id: cfg.config_id,
            strategy_id: strategyId,
            ...(params !== undefined && { params }),
          };
        },
      );

      const request: BacktestRequest = {
        total_capital: parsedData.total_capital,
        configs,
        ...(parsedData.token_symbol !== undefined && {
          token_symbol: parsedData.token_symbol,
        }),
        ...(parsedData.start_date !== undefined && {
          start_date: parsedData.start_date,
        }),
        ...(parsedData.end_date !== undefined && {
          end_date: parsedData.end_date,
        }),
        ...(parsedData.days !== undefined && { days: parsedData.days }),
      };

      if (options) {
        mutate(request, options);
      } else {
        mutate(request);
      }
    },
    [mutate],
  );

  const validatePayload = useCallback(() => {
    if (!parsedEditorPayload) {
      return { ok: false as const, error: 'Invalid JSON: unable to parse.' };
    }
    const parsed = backtestRequestSchema.safeParse(parsedEditorPayload);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: formatValidationError(parsed.error),
      };
    }
    const catalogError = validateConfigsStrategyIdsAgainstCatalog(
      parsed.data.configs,
      strategyConfigs?.strategies,
    );
    if (catalogError) {
      return { ok: false as const, error: catalogError };
    }
    return { ok: true as const, data: parsed.data };
  }, [parsedEditorPayload, strategyConfigs?.strategies]);

  const handleRunBacktest = () => {
    const result = validatePayload();
    if (!result.ok) {
      setEditorError(result.error);
      return;
    }
    setEditorError(null);
    submitBacktest(result.data);
  };

  useEffect(() => {
    if (!defaultsReady || initialRunStarted.current) {
      return;
    }

    const result = validatePayload();
    if (!result.ok) {
      setEditorError(result.error);
      setInitialRunSettled(true);
      return;
    }

    initialRunStarted.current = true;
    setEditorError(null);
    submitBacktest(result.data, {
      onSettled: () => {
        setInitialRunSettled(true);
      },
    });
  }, [defaultsReady, validatePayload, submitBacktest]);

  const isInitializing =
    !initialRunSettled && !backtestData && !error && !editorError;

  const resetConfiguration = () => {
    userEdited.current = false;
    setEditorValue(buildDefaultEditorValue(strategyConfigs));
    setEditorError(null);
  };

  const updateEditorValue = (val: string) => {
    userEdited.current = true;
    setEditorValue(
      normalizePresetBackedConfigs(val, strategyConfigs?.presets ?? []),
    );
  };

  // Compute display values from the editor JSON. Selection is keyed on the
  // config_id of the first non-benchmark compare config so distinct presets
  // that share a strategy_id (e.g. default vs optimized) are each selectable.
  const days = parseJsonField(editorValue, 'days', DEFAULT_DAYS);
  const selectedConfigId = parseSelectedConfigId(
    editorValue,
    DMA_FGI_PORTFOLIO_RULES_DEFAULT_CONFIG_ID,
    strategyConfigs?.presets ?? [],
  );

  const strategyOptions = useMemo(() => {
    const presets = (strategyConfigs?.presets ?? []).filter(
      (preset) =>
        !preset.is_benchmark && preset.strategy_id !== DCA_CLASSIC_STRATEGY_ID,
    );
    if (!presets.length) {
      return [{ value: selectedConfigId, label: selectedConfigId }];
    }
    return presets.map((preset) => ({
      value: preset.config_id,
      label: preset.display_name,
    }));
  }, [strategyConfigs?.presets, selectedConfigId]);

  return {
    backtestData,
    strategyConfigs,
    days,
    editorError,
    editorValue,
    error,
    isInitializing,
    isPending,
    selectedConfigId,
    setEditorError,
    strategyOptions,
    handleRunBacktest,
    resetConfiguration,
    updateEditorValue,
  };
}
