import type { ReactElement } from 'react';

import { LoadingState } from '@/components/ui';

import { ConfigEditorHeader } from './ConfigEditorHeader';
import { ConfigEditorJsonSection } from './ConfigEditorJsonSection';
import { type ConfigEditorViewProps } from './configEditorShared';
import { ConfigEditorStructuredFields } from './ConfigEditorStructuredFields';
import { useConfigEditorForm } from './useConfigEditorForm';

/**
 * Create/edit form for strategy configurations.
 *
 * @param props - Editor props including mode, configId, and handlers
 * @returns Editor form element
 */
export function ConfigEditorView({
  configId,
  mode,
  duplicateFrom,
  onCancel,
  onSaved,
  onDuplicate,
}: ConfigEditorViewProps): ReactElement {
  const {
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
  } = useConfigEditorForm({
    configId,
    mode,
    duplicateFrom,
    onSaved,
  });

  if (mode === 'edit' && isLoading) {
    return <LoadingState className="min-h-[20rem]" size="lg" />;
  }

  return (
    <div className="space-y-6">
      <ConfigEditorHeader
        configIdInput={formState.configIdInput}
        existingConfig={existingConfig}
        isBenchmark={isBenchmark}
        mode={mode}
        onCancel={onCancel}
        onDuplicate={onDuplicate}
      />

      <ConfigEditorStructuredFields
        configIdValid={configIdValid}
        formState={formState}
        isBenchmark={isBenchmark}
        mode={mode}
        setFormState={setFormState}
      />

      <ConfigEditorJsonSection
        activeJsonEditor={activeJsonEditor}
        activeJsonTab={activeJsonTab}
        formValid={formValid}
        isBenchmark={isBenchmark}
        isSaving={isSaving}
        onCancel={onCancel}
        onSave={() => {
          void handleSave();
        }}
        setActiveJsonTab={setActiveJsonTab}
      />
    </div>
  );
}
