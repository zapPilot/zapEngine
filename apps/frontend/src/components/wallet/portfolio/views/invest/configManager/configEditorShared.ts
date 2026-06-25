import type {
  BacktestCompareParamsV3,
  SavedStrategyConfig,
  StrategyComposition,
} from '@zapengine/app-core/types';
import type { Dispatch, SetStateAction } from 'react';

import { DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID } from '@/components/wallet/portfolio/views/backtesting/constants';

export interface ConfigEditorViewProps {
  configId: string | null;
  mode: 'create' | 'edit';
  duplicateFrom: SavedStrategyConfig | null;
  onCancel: () => void;
  onSaved: () => void;
  onDuplicate: (config: SavedStrategyConfig) => void;
}

export const CONFIG_ID_PATTERN = /^[a-z0-9_]+$/;
export const JSON_TABS = ['params', 'composition'] as const;
export const LOCKED_STRATEGY_ID = DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID;

export type JsonTab = (typeof JSON_TABS)[number];
export type ConfigEditorMode = ConfigEditorViewProps['mode'];

export interface ParsedJsonResult<T> {
  parsed: T | null;
  valid: boolean;
}

export interface ConfigEditorFormState {
  configIdInput: string;
  displayName: string;
  description: string;
  strategyId: string;
  primaryAsset: string;
  disabledRules: string[];
  supportsDailySuggestion: boolean;
  paramsJson: string;
  compositionJson: string;
}

export interface ConfigFieldsPayload {
  composition: StrategyComposition;
  description: string | null;
  display_name: string;
  params: BacktestCompareParamsV3;
  primary_asset: string;
  strategy_id: string;
  supports_daily_suggestion: boolean;
}

export interface JsonEditorPanelProps {
  disabled: boolean;
  onChange: (value: string) => void;
  rows: number;
  valid: boolean;
  value: string;
}

const INITIAL_FORM_STATE: ConfigEditorFormState = {
  configIdInput: '',
  displayName: '',
  description: '',
  strategyId: LOCKED_STRATEGY_ID,
  primaryAsset: '',
  disabledRules: [],
  supportsDailySuggestion: false,
  paramsJson: '{}',
  compositionJson: '{}',
};

export function normalizeRuleNames(ruleNames: string[]): string[] {
  return [...new Set(ruleNames)]
    .filter((ruleName) => ruleName.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

export function tryParseJson<T>(value: string): ParsedJsonResult<T> {
  try {
    return { valid: true, parsed: JSON.parse(value) as T };
  } catch {
    return { valid: false, parsed: null };
  }
}

export function getInitialFormState(): ConfigEditorFormState {
  return {
    ...INITIAL_FORM_STATE,
    disabledRules: [...INITIAL_FORM_STATE.disabledRules],
  };
}

export function getSeedConfig(
  mode: ConfigEditorMode,
  existingConfig: SavedStrategyConfig | null | undefined,
  duplicateFrom: SavedStrategyConfig | null,
): SavedStrategyConfig | null {
  return mode === 'edit' ? (existingConfig ?? null) : duplicateFrom;
}

export function getSeededFormState(
  mode: ConfigEditorMode,
  seedConfig: SavedStrategyConfig | null,
): ConfigEditorFormState {
  if (!seedConfig) {
    return getInitialFormState();
  }
  const disabledRules = normalizeRuleNames(
    Array.isArray(seedConfig.params.disabled_rules)
      ? seedConfig.params.disabled_rules.filter(
          (ruleName): ruleName is string => typeof ruleName === 'string',
        )
      : [],
  );

  return {
    configIdInput: mode === 'edit' ? seedConfig.config_id : '',
    displayName:
      mode === 'edit'
        ? seedConfig.display_name
        : `${seedConfig.display_name} (copy)`,
    description: seedConfig.description ?? '',
    strategyId: LOCKED_STRATEGY_ID,
    primaryAsset: seedConfig.primary_asset,
    disabledRules,
    supportsDailySuggestion: seedConfig.supports_daily_suggestion,
    paramsJson: JSON.stringify(seedConfig.params, null, 2),
    compositionJson: JSON.stringify(seedConfig.composition, null, 2),
  };
}

export function getEditorTitle(mode: ConfigEditorMode): string {
  return mode === 'create' ? 'Create Configuration' : 'Edit Configuration';
}

export function getMutationErrorTitle(mode: ConfigEditorMode): string {
  return mode === 'create' ? 'Create failed' : 'Update failed';
}

export function buildFieldsPayload(
  formState: ConfigEditorFormState,
  params: BacktestCompareParamsV3,
  composition: StrategyComposition,
): ConfigFieldsPayload {
  const disabledRules = normalizeRuleNames(formState.disabledRules);
  const mergedParams: BacktestCompareParamsV3 = { ...params };
  if (disabledRules.length > 0) {
    mergedParams.disabled_rules = disabledRules;
  } else {
    delete mergedParams.disabled_rules;
  }

  return {
    display_name: formState.displayName.trim(),
    description: formState.description.trim() || null,
    strategy_id: LOCKED_STRATEGY_ID,
    primary_asset: formState.primaryAsset,
    supports_daily_suggestion: formState.supportsDailySuggestion,
    params: mergedParams,
    composition,
  };
}

export function getActiveJsonEditorState(
  activeJsonTab: JsonTab,
  formState: ConfigEditorFormState,
  paramsValidation: ParsedJsonResult<BacktestCompareParamsV3>,
  compositionValidation: ParsedJsonResult<StrategyComposition>,
  setFormState: Dispatch<SetStateAction<ConfigEditorFormState>>,
): JsonEditorPanelProps {
  const field = activeJsonTab === 'params' ? 'paramsJson' : 'compositionJson';
  const validation =
    activeJsonTab === 'params' ? paramsValidation : compositionValidation;

  return {
    value: formState[field],
    onChange: function onChange(value: string): void {
      setFormState((previous) => ({ ...previous, [field]: value }));
    },
    valid: validation.valid,
    rows: activeJsonTab === 'params' ? 12 : 16,
    disabled: false,
  };
}
