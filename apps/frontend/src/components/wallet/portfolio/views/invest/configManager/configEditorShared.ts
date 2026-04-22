import type { Dispatch, SetStateAction } from 'react';

import type {
  BacktestCompareParamsV3,
  SavedStrategyConfig,
  StrategyComposition,
} from '@/types';

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

export const INITIAL_FORM_STATE: ConfigEditorFormState = {
  configIdInput: '',
  displayName: '',
  description: '',
  strategyId: '',
  primaryAsset: '',
  supportsDailySuggestion: false,
  paramsJson: '{}',
  compositionJson: '{}',
};

export function tryParseJson<T>(value: string): ParsedJsonResult<T> {
  try {
    return { valid: true, parsed: JSON.parse(value) as T };
  } catch {
    return { valid: false, parsed: null };
  }
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
    return INITIAL_FORM_STATE;
  }

  return {
    configIdInput: mode === 'edit' ? seedConfig.config_id : '',
    displayName:
      mode === 'edit'
        ? seedConfig.display_name
        : `${seedConfig.display_name} (copy)`,
    description: seedConfig.description ?? '',
    strategyId: seedConfig.strategy_id,
    primaryAsset: seedConfig.primary_asset,
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
  return {
    display_name: formState.displayName.trim(),
    description: formState.description.trim() || null,
    strategy_id: formState.strategyId,
    primary_asset: formState.primaryAsset,
    supports_daily_suggestion: formState.supportsDailySuggestion,
    params,
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
  if (activeJsonTab === 'params') {
    return {
      value: formState.paramsJson,
      onChange: function onChange(value: string): void {
        setFormState((previous) => ({ ...previous, paramsJson: value }));
      },
      valid: paramsValidation.valid,
      rows: 12,
      disabled: false,
    };
  }

  return {
    value: formState.compositionJson,
    onChange: function onChange(value: string): void {
      setFormState((previous) => ({ ...previous, compositionJson: value }));
    },
    valid: compositionValidation.valid,
    rows: 16,
    disabled: false,
  };
}
