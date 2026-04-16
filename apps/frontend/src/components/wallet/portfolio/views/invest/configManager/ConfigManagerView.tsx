import { type ReactElement, useReducer } from "react";

import { Spinner } from "@/components/ui";
import { useStrategyAdminConfigs } from "@/hooks/queries/strategyAdmin";
import type { SavedStrategyConfig } from "@/types";

import { ConfigEditorView } from "./ConfigEditorView";
import { ConfigListView } from "./ConfigListView";

type ViewMode = "list" | "editor";
type EditorMode = "create" | "edit";

interface NavigationState {
  viewMode: ViewMode;
  editorMode: EditorMode;
  selectedConfigId: string | null;
  duplicateFrom: SavedStrategyConfig | null;
}

type NavigationAction =
  | { type: "edit"; configId: string }
  | { type: "create" }
  | { type: "duplicate"; config: SavedStrategyConfig }
  | { type: "backToList" };

const initialState: NavigationState = {
  viewMode: "list",
  editorMode: "create",
  selectedConfigId: null,
  duplicateFrom: null,
};

function navigationReducer(
  _state: NavigationState,
  action: NavigationAction
): NavigationState {
  switch (action.type) {
    case "edit":
      return {
        viewMode: "editor",
        editorMode: "edit",
        selectedConfigId: action.configId,
        duplicateFrom: null,
      };
    case "create":
      return {
        viewMode: "editor",
        editorMode: "create",
        selectedConfigId: null,
        duplicateFrom: null,
      };
    case "duplicate":
      return {
        viewMode: "editor",
        editorMode: "create",
        selectedConfigId: null,
        duplicateFrom: action.config,
      };
    case "backToList":
      return initialState;
  }
}

/**
 * Top-level container for the strategy config manager sub-tab.
 *
 * Owns the list/editor view state and orchestrates navigation between them.
 *
 * @returns Config manager view element
 */
export function ConfigManagerView(): ReactElement {
  const { data: configs, isLoading, error } = useStrategyAdminConfigs();
  const [nav, dispatch] = useReducer(navigationReducer, initialState);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <p className="text-sm text-red-400">
          Failed to load configurations.{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const handleDuplicate = (config: SavedStrategyConfig) =>
    dispatch({ type: "duplicate", config });

  const handleBackToList = () => dispatch({ type: "backToList" });

  if (nav.viewMode === "editor") {
    return (
      <ConfigEditorView
        configId={nav.selectedConfigId}
        mode={nav.editorMode}
        duplicateFrom={nav.duplicateFrom}
        onCancel={handleBackToList}
        onSaved={handleBackToList}
        onDuplicate={handleDuplicate}
      />
    );
  }

  return (
    <ConfigListView
      configs={configs ?? []}
      onEdit={configId => dispatch({ type: "edit", configId })}
      onDuplicate={handleDuplicate}
      onCreate={() => dispatch({ type: "create" })}
    />
  );
}
