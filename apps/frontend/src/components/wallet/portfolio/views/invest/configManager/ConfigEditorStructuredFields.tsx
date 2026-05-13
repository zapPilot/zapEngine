import { Info } from 'lucide-react';
import type { Dispatch, ReactElement, SetStateAction } from 'react';

import {
  type PortfolioRuleMetadata,
  usePortfolioRules,
} from '@/hooks/usePortfolioRules';

import {
  type ConfigEditorFormState,
  type ConfigEditorMode,
  LOCKED_STRATEGY_ID,
  normalizeRuleNames,
} from './configEditorShared';

interface ConfigEditorStructuredFieldsProps {
  configIdValid: boolean;
  formState: ConfigEditorFormState;
  isBenchmark: boolean;
  mode: ConfigEditorMode;
  setFormState: Dispatch<SetStateAction<ConfigEditorFormState>>;
}

function updateField<Key extends keyof ConfigEditorFormState>(
  setFormState: Dispatch<SetStateAction<ConfigEditorFormState>>,
  key: Key,
  value: ConfigEditorFormState[Key],
): void {
  setFormState((previous) => ({
    ...previous,
    [key]: value,
  }));
}

function updateRuleEnabled(
  setFormState: Dispatch<SetStateAction<ConfigEditorFormState>>,
  ruleName: string,
  enabled: boolean,
): void {
  setFormState((previous) => {
    const disabledRules = enabled
      ? previous.disabledRules.filter(
          (disabledRule) => disabledRule !== ruleName,
        )
      : normalizeRuleNames([...previous.disabledRules, ruleName]);
    return {
      ...previous,
      disabledRules,
    };
  });
}

function resetRulesToDefaults(
  setFormState: Dispatch<SetStateAction<ConfigEditorFormState>>,
  rules: PortfolioRuleMetadata[],
): void {
  setFormState((previous) => ({
    ...previous,
    disabledRules: normalizeRuleNames(
      rules.filter((rule) => !rule.defaultEnabled).map((rule) => rule.name),
    ),
  }));
}

export function ConfigEditorStructuredFields({
  configIdValid,
  formState,
  isBenchmark,
  mode,
  setFormState,
}: ConfigEditorStructuredFieldsProps): ReactElement {
  const { rules } = usePortfolioRules();

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 space-y-5">
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
          Config ID
        </label>
        {mode === 'create' ? (
          <div>
            <input
              type="text"
              value={formState.configIdInput}
              onChange={(event) =>
                updateField(setFormState, 'configIdInput', event.target.value)
              }
              placeholder="my_strategy_config"
              className={`w-full rounded-lg border bg-gray-800/50 px-3 py-2 font-mono text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 ${
                formState.configIdInput && !configIdValid
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-700 focus:ring-purple-500'
              }`}
              disabled={isBenchmark}
            />
            {formState.configIdInput && !configIdValid && (
              <p className="mt-1 text-xs text-red-400">
                Only lowercase letters, digits, and underscores allowed
              </p>
            )}
          </div>
        ) : (
          <span className="inline-block rounded-full bg-gray-800 px-3 py-1.5 font-mono text-sm text-gray-300">
            {formState.configIdInput}
          </span>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
          Display Name *
        </label>
        <input
          type="text"
          value={formState.displayName}
          onChange={(event) =>
            updateField(setFormState, 'displayName', event.target.value)
          }
          placeholder="My Strategy Config"
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
          disabled={isBenchmark}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
          Description
        </label>
        <textarea
          value={formState.description}
          onChange={(event) =>
            updateField(setFormState, 'description', event.target.value)
          }
          placeholder="Optional description..."
          rows={2}
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
          disabled={isBenchmark}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
            Strategy ID *
          </label>
          <span className="inline-flex min-h-10 w-full items-center rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 font-mono text-sm text-gray-200">
            {LOCKED_STRATEGY_ID}
          </span>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
            Primary Asset *
          </label>
          <input
            type="text"
            value={formState.primaryAsset}
            onChange={(event) =>
              updateField(setFormState, 'primaryAsset', event.target.value)
            }
            placeholder="BTC"
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
            disabled={isBenchmark}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-white">Portfolio Rules</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateField(setFormState, 'disabledRules', [])}
              disabled={isBenchmark}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enable all
            </button>
            <button
              type="button"
              onClick={() => resetRulesToDefaults(setFormState, rules)}
              disabled={isBenchmark}
              className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset to defaults
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {rules.map((rule) => {
            const checked = !formState.disabledRules.includes(rule.name);
            return (
              <label
                key={rule.name}
                className="grid grid-cols-[auto,1fr,auto,auto] items-center gap-3 py-3"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    updateRuleEnabled(
                      setFormState,
                      rule.name,
                      event.target.checked,
                    )
                  }
                  disabled={isBenchmark}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="min-w-0 break-words font-mono text-sm text-gray-200">
                  {rule.name}
                </span>
                <span className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 font-mono text-xs text-gray-400">
                  P{rule.priority}
                </span>
                <span
                  aria-label={`${rule.name} description`}
                  role="img"
                  title={rule.description}
                >
                  <Info aria-hidden className="h-4 w-4 text-gray-500" />
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">
            Supports Daily Suggestion
          </p>
          <p className="text-xs text-gray-500">
            Enable to allow this config as a daily suggestion preset
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={formState.supportsDailySuggestion}
          onClick={() =>
            updateField(
              setFormState,
              'supportsDailySuggestion',
              !formState.supportsDailySuggestion,
            )
          }
          disabled={isBenchmark}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed ${
            formState.supportsDailySuggestion ? 'bg-purple-600' : 'bg-gray-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              formState.supportsDailySuggestion
                ? 'translate-x-5'
                : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
