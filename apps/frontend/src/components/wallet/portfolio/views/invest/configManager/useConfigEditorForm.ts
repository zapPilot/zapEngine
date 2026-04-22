import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useCreateStrategyConfig,
  useUpdateStrategyConfig,
} from '@/hooks/mutations';
import { useStrategyAdminConfig } from '@/hooks/queries/strategyAdmin';
import { useToast } from '@/providers/ToastProvider';
import type {
  BacktestCompareParamsV3,
  SavedStrategyConfig,
  StrategyComposition,
} from '@/types';

import {
  buildFieldsPayload,
  CONFIG_ID_PATTERN,
  type ConfigEditorFormState,
  type ConfigEditorMode,
  getActiveJsonEditorState,
  getMutationErrorTitle,
  getSeedConfig,
  getSeededFormState,
  INITIAL_FORM_STATE,
  type JsonTab,
  tryParseJson,
} from './configEditorShared';

interface UseConfigEditorFormParams {
  configId: string | null;
  mode: ConfigEditorMode;
  duplicateFrom: SavedStrategyConfig | null;
  onSaved: () => void;
}

interface UseConfigEditorFormResult {
  activeJsonEditor: ReturnType<typeof getActiveJsonEditorState>;
  activeJsonTab: JsonTab;
  configIdValid: boolean;
  existingConfig: SavedStrategyConfig | null | undefined;
  formState: ConfigEditorFormState;
  formValid: boolean;
  isBenchmark: boolean;
  isLoading: boolean;
  isSaving: boolean;
  setActiveJsonTab: (tab: JsonTab) => void;
  setFormState: Dispatch<SetStateAction<ConfigEditorFormState>>;
  handleSave: () => Promise<void>;
}

export function useConfigEditorForm({
  configId,
  mode,
  duplicateFrom,
  onSaved,
}: UseConfigEditorFormParams): UseConfigEditorFormResult {
  const { showToast } = useToast();
  const { data: existingConfig, isLoading } = useStrategyAdminConfig(
    mode === 'edit' ? configId : null,
  );
  const createMutation = useCreateStrategyConfig();
  const updateMutation = useUpdateStrategyConfig();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const [formState, setFormState] =
    useState<ConfigEditorFormState>(INITIAL_FORM_STATE);
  const [activeJsonTab, setActiveJsonTab] = useState<JsonTab>('params');

  const seedConfig = useMemo(
    () => getSeedConfig(mode, existingConfig, duplicateFrom),
    [duplicateFrom, existingConfig, mode],
  );

  useEffect(() => {
    setFormState(getSeededFormState(mode, seedConfig));
  }, [mode, seedConfig]);

  const isBenchmark = mode === 'edit' && existingConfig?.is_benchmark === true;
  const paramsValidation = useMemo(
    () => tryParseJson<BacktestCompareParamsV3>(formState.paramsJson),
    [formState.paramsJson],
  );
  const compositionValidation = useMemo(
    () => tryParseJson<StrategyComposition>(formState.compositionJson),
    [formState.compositionJson],
  );

  const configIdValid =
    mode === 'edit' || CONFIG_ID_PATTERN.test(formState.configIdInput);
  const formValid =
    configIdValid &&
    formState.displayName.trim().length > 0 &&
    formState.strategyId.trim().length > 0 &&
    formState.primaryAsset.trim().length > 0 &&
    paramsValidation.valid &&
    compositionValidation.valid;
  const activeJsonEditor = getActiveJsonEditorState(
    activeJsonTab,
    formState,
    paramsValidation,
    compositionValidation,
    setFormState,
  );

  const handleSave = useCallback(async (): Promise<void> => {
    if (!formValid || isBenchmark) {
      return;
    }

    if (!paramsValidation.parsed || !compositionValidation.parsed) {
      return;
    }

    const sharedFields = buildFieldsPayload(
      formState,
      paramsValidation.parsed,
      compositionValidation.parsed,
    );

    try {
      if (mode === 'create') {
        await createMutation.mutateAsync({
          config_id: formState.configIdInput,
          ...sharedFields,
        });
        showToast({
          type: 'success',
          title: 'Configuration created',
          message: `"${sharedFields.display_name}" has been created.`,
        });
      } else {
        await updateMutation.mutateAsync({
          configId: formState.configIdInput,
          body: sharedFields,
        });
        showToast({
          type: 'success',
          title: 'Configuration updated',
          message: `"${sharedFields.display_name}" has been saved.`,
        });
      }

      onSaved();
    } catch (error) {
      showToast({
        type: 'error',
        title: getMutationErrorTitle(mode),
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [
    compositionValidation.parsed,
    createMutation,
    formState,
    formValid,
    isBenchmark,
    mode,
    onSaved,
    paramsValidation.parsed,
    showToast,
    updateMutation,
  ]);

  return {
    activeJsonEditor,
    activeJsonTab,
    configIdValid,
    existingConfig,
    formState,
    formValid,
    isBenchmark,
    isLoading,
    isSaving,
    setActiveJsonTab,
    setFormState,
    handleSave,
  };
}
