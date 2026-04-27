import type { Dispatch, ReactElement, SetStateAction } from 'react';

import { useStrategyConfigs } from '@/components/wallet/portfolio/views/invest/trading/hooks/useStrategyConfigs';

import {
  type ConfigEditorFormState,
  type ConfigEditorMode,
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

export function ConfigEditorStructuredFields({
  configIdValid,
  formState,
  isBenchmark,
  mode,
  setFormState,
}: ConfigEditorStructuredFieldsProps): ReactElement {
  const {
    data: strategyConfigs,
    isLoading: strategiesLoading,
    isError: strategiesError,
  } = useStrategyConfigs();
  const strategies = strategyConfigs?.strategies ?? [];

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
          <select
            value={formState.strategyId}
            onChange={(event) =>
              updateField(setFormState, 'strategyId', event.target.value)
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
            disabled={isBenchmark}
          >
            <option value="">Select strategy...</option>
            {strategiesLoading && (
              <option value="" disabled>
                Loading…
              </option>
            )}
            {strategiesError && (
              <option value="" disabled>
                Failed to load strategies
              </option>
            )}
            {strategies.map((strategy) => (
              <option key={strategy.strategy_id} value={strategy.strategy_id}>
                {strategy.display_name}
              </option>
            ))}
          </select>
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
