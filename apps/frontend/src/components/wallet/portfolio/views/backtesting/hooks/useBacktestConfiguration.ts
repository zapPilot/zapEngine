import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBacktestMutation } from '@/hooks/mutations/useBacktestMutation';
import { getStrategyConfigs } from '@/services';
import type { BacktestRequest } from '@/types/backtesting';
import type { StrategyConfigsResponse } from '@/types/strategy';

import { DEFAULT_DAYS, ETH_BTC_ROTATION_STRATEGY_ID } from '../constants';
import {
  normalizePresetBackedConfigs,
  parseConfigStrategyIdWithPresets,
  parseJsonField,
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
    JSON.stringify(
      buildDefaultPayloadFromStrategies(null, FALLBACK_DEFAULTS),
      null,
      2,
    ),
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
        if (!userEdited.current && configs.presets.length > 0) {
          const payload = buildDefaultPayloadFromPresets(
            configs.presets,
            configs.backtest_defaults,
          );
          setEditorValue(JSON.stringify(payload, null, 2));
          setDefaultsReady(true);
          return;
        }
        if (!userEdited.current) {
          const payload = buildDefaultPayloadFromStrategies(
            configs.strategies,
            configs.backtest_defaults,
          );
          setEditorValue(JSON.stringify(payload, null, 2));
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
    const defaults = strategyConfigs?.backtest_defaults ?? FALLBACK_DEFAULTS;
    const payload =
      strategyConfigs && strategyConfigs.presets.length > 0
        ? buildDefaultPayloadFromPresets(strategyConfigs.presets, defaults)
        : buildDefaultPayloadFromStrategies(
            strategyConfigs?.strategies ?? null,
            defaults,
          );
    userEdited.current = false;
    setEditorValue(JSON.stringify(payload, null, 2));
    setEditorError(null);
  };

  const updateEditorValue = (val: string) => {
    userEdited.current = true;
    setEditorValue(
      normalizePresetBackedConfigs(val, strategyConfigs?.presets ?? []),
    );
  };

  // Compute display values from the editor JSON
  const days = parseJsonField(editorValue, 'days', DEFAULT_DAYS);
  const selectedStrategyId = parseConfigStrategyIdWithPresets(
    editorValue,
    ETH_BTC_ROTATION_STRATEGY_ID,
    strategyConfigs?.presets ?? [],
  );

  const strategyOptions = useMemo(() => {
    if (!strategyConfigs?.strategies?.length) {
      return [{ value: selectedStrategyId, label: selectedStrategyId }];
    }
    return strategyConfigs.strategies.map((s) => ({
      value: s.strategy_id,
      label: s.display_name,
    }));
  }, [strategyConfigs?.strategies, selectedStrategyId]);

  return {
    backtestData,
    strategyConfigs,
    days,
    editorError,
    editorValue,
    error,
    isInitializing,
    isPending,
    selectedStrategyId,
    setEditorError,
    strategyOptions,
    handleRunBacktest,
    resetConfiguration,
    updateEditorValue,
  };
}
