import { AlertTriangle, ArrowLeft, Copy } from "lucide-react";
import type { ReactElement } from "react";

import type { SavedStrategyConfig } from "@/types";

import { type ConfigEditorMode, getEditorTitle } from "./configEditorShared";

interface ConfigEditorHeaderProps {
  configIdInput: string;
  existingConfig: SavedStrategyConfig | null | undefined;
  isBenchmark: boolean;
  mode: ConfigEditorMode;
  onCancel: () => void;
  onDuplicate: (config: SavedStrategyConfig) => void;
}

export function ConfigEditorHeader({
  configIdInput,
  existingConfig,
  isBenchmark,
  mode,
  onCancel,
  onDuplicate,
}: ConfigEditorHeaderProps): ReactElement {
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h3 className="text-lg font-semibold text-white">
            {getEditorTitle(mode)}
          </h3>
          {mode === "edit" && (
            <span className="rounded-full bg-gray-800 px-3 py-1 font-mono text-xs text-gray-400">
              {configIdInput}
            </span>
          )}
        </div>
        {mode === "edit" && !isBenchmark && existingConfig && (
          <button
            onClick={() => onDuplicate(existingConfig)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </button>
        )}
      </div>

      {isBenchmark && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            This is a benchmark configuration and cannot be modified. Duplicate
            it to create an editable copy.
          </p>
        </div>
      )}
    </>
  );
}
