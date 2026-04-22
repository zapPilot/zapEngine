import { Copy, Edit2, Lock, Plus, Star } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

import { useSetDefaultStrategyConfig } from '@/hooks/mutations';
import { useToast } from '@/providers/ToastProvider';
import type { SavedStrategyConfig } from '@/types';

import { SetDefaultConfirmModal } from './SetDefaultConfirmModal';

interface ConfigListViewProps {
  configs: SavedStrategyConfig[];
  onEdit: (configId: string) => void;
  onDuplicate: (config: SavedStrategyConfig) => void;
  onCreate: () => void;
}

interface ConfigActionHandlers {
  onEdit: (configId: string) => void;
  onDuplicate: (config: SavedStrategyConfig) => void;
  onSetDefault: (config: SavedStrategyConfig) => void;
}

const ACTION_STYLES = {
  desktop: {
    wrap: 'flex justify-end gap-2',
    edit: 'rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors',
    setDefault:
      'rounded p-1.5 text-gray-400 hover:bg-emerald-900/50 hover:text-emerald-400 transition-colors',
    duplicate:
      'rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors',
  },
  mobile: {
    wrap: 'flex gap-2 border-t border-gray-800 pt-3',
    edit: 'rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors',
    setDefault:
      'rounded-lg border border-emerald-700 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-900/30 transition-colors',
    duplicate:
      'rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors',
  },
} as const;

function ConfigActions({
  config,
  handlers,
  variant,
}: {
  config: SavedStrategyConfig;
  handlers: ConfigActionHandlers;
  variant: 'desktop' | 'mobile';
}): ReactElement | null {
  if (config.is_benchmark) return null;
  const s = ACTION_STYLES[variant];
  const showIcon = variant === 'desktop';
  return (
    <div className={s.wrap}>
      <button
        onClick={() => handlers.onEdit(config.config_id)}
        title="Edit"
        className={s.edit}
      >
        {showIcon ? <Edit2 className="h-4 w-4" /> : 'Edit'}
      </button>
      {config.supports_daily_suggestion && !config.is_default && (
        <button
          onClick={() => handlers.onSetDefault(config)}
          title="Set as Default"
          className={s.setDefault}
        >
          {showIcon ? <Star className="h-4 w-4" /> : 'Set Default'}
        </button>
      )}
      <button
        onClick={() => handlers.onDuplicate(config)}
        title="Duplicate"
        className={s.duplicate}
      >
        {showIcon ? <Copy className="h-4 w-4" /> : 'Duplicate'}
      </button>
    </div>
  );
}

function StatusBadges({
  config,
}: {
  config: SavedStrategyConfig;
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-1.5">
      {config.is_default && (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
          <Star className="h-3 w-3" />
          Default
        </span>
      )}
      {config.is_benchmark && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
          <Lock className="h-3 w-3" />
          Benchmark
        </span>
      )}
      {config.supports_daily_suggestion && (
        <span className="inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/20 px-2 py-0.5 text-xs text-sky-400">
          Daily
        </span>
      )}
    </div>
  );
}

/**
 * Table/card view listing all strategy configurations with actions.
 *
 * @param props - List of configs and action handlers
 * @returns List view element
 */
export function ConfigListView({
  configs,
  onEdit,
  onDuplicate,
  onCreate,
}: ConfigListViewProps): ReactElement {
  const { showToast } = useToast();
  const setDefaultMutation = useSetDefaultStrategyConfig();

  const [confirmTarget, setConfirmTarget] =
    useState<SavedStrategyConfig | null>(null);

  const currentDefault = useMemo(
    () => configs.find((c) => c.is_default),
    [configs],
  );

  const handleSetDefault = useCallback((config: SavedStrategyConfig) => {
    setConfirmTarget(config);
  }, []);

  const handleConfirmSetDefault = useCallback(async () => {
    if (!confirmTarget) return;
    try {
      await setDefaultMutation.mutateAsync(confirmTarget.config_id);
      showToast({
        type: 'success',
        title: 'Default updated',
        message: `"${confirmTarget.display_name}" is now the default configuration.`,
      });
      setConfirmTarget(null);
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Failed to set default',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [confirmTarget, setDefaultMutation, showToast]);

  const actionHandlers: ConfigActionHandlers = useMemo(
    () => ({ onEdit, onDuplicate, onSetDefault: handleSetDefault }),
    [onEdit, onDuplicate, handleSetDefault],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          Strategy Configurations
        </h3>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Create New
        </button>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Config ID</th>
              <th className="px-4 py-3">Display Name</th>
              <th className="px-4 py-3">Strategy</th>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {configs.map((config) => (
              <tr
                key={config.config_id}
                className={`hover:bg-gray-800/30 transition-colors ${
                  config.is_benchmark ? 'opacity-60' : ''
                }`}
              >
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {config.config_id}
                </td>
                <td className="px-4 py-3 text-white">{config.display_name}</td>
                <td className="px-4 py-3 text-gray-300">
                  {config.strategy_id}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {config.primary_asset}
                </td>
                <td className="px-4 py-3">
                  <StatusBadges config={config} />
                </td>
                <td className="px-4 py-3">
                  <ConfigActions
                    config={config}
                    handlers={actionHandlers}
                    variant="desktop"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3">
        {configs.map((config) => (
          <div
            key={config.config_id}
            className={`rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-3 ${
              config.is_benchmark ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-white">{config.display_name}</p>
                <p className="font-mono text-xs text-gray-500">
                  {config.config_id}
                </p>
              </div>
              <StatusBadges config={config} />
            </div>
            <div className="flex gap-4 text-xs text-gray-400">
              <span>Strategy: {config.strategy_id}</span>
              <span>Asset: {config.primary_asset}</span>
            </div>
            <ConfigActions
              config={config}
              handlers={actionHandlers}
              variant="mobile"
            />
          </div>
        ))}
      </div>

      {/* Empty state */}
      {configs.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-12 text-center">
          <p className="text-gray-500">No configurations found.</p>
        </div>
      )}

      {/* Set Default Confirmation Modal */}
      <SetDefaultConfirmModal
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirmSetDefault}
        isPending={setDefaultMutation.isPending}
        currentDefaultName={currentDefault?.display_name ?? 'None'}
        targetConfigName={confirmTarget?.display_name ?? ''}
      />
    </div>
  );
}
