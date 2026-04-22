import { Save } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  JSON_TABS,
  type JsonEditorPanelProps,
  type JsonTab,
} from './configEditorShared';

interface ConfigEditorJsonSectionProps {
  activeJsonEditor: JsonEditorPanelProps;
  activeJsonTab: JsonTab;
  formValid: boolean;
  isBenchmark: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
  setActiveJsonTab: (tab: JsonTab) => void;
}

function JsonEditorPanel({
  disabled,
  onChange,
  rows,
  valid,
  value,
}: JsonEditorPanelProps): ReactElement {
  return (
    <div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        spellCheck={false}
        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 font-mono text-sm text-green-400 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-y"
        disabled={disabled}
      />
      {value.trim() && (
        <p
          className={`mt-1.5 text-xs ${valid ? 'text-green-500' : 'text-red-400'}`}
        >
          {valid
            ? 'Valid JSON'
            : 'Invalid JSON — fix syntax errors before saving'}
        </p>
      )}
    </div>
  );
}

export function ConfigEditorJsonSection({
  activeJsonEditor,
  activeJsonTab,
  formValid,
  isBenchmark,
  isSaving,
  onCancel,
  onSave,
  setActiveJsonTab,
}: ConfigEditorJsonSectionProps): ReactElement {
  return (
    <>
      <div className="rounded-xl border border-gray-800 bg-gray-900/40">
        <div className="flex border-b border-gray-800">
          {JSON_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveJsonTab(tab)}
              className={`px-4 py-3 text-sm font-medium capitalize transition-colors ${
                activeJsonTab === tab
                  ? 'border-b-2 border-purple-500 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4">
          <JsonEditorPanel {...activeJsonEditor} disabled={isBenchmark} />
        </div>
      </div>

      {!isBenchmark && (
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-lg border border-gray-600 px-5 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!formValid || isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </>
  );
}
