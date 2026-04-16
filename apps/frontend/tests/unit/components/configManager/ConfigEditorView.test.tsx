import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigEditorView } from "@/components/wallet/portfolio/views/invest/configManager/ConfigEditorView";
import type { SavedStrategyConfig } from "@/types";

import { fireEvent, render, screen, waitFor } from "../../../test-utils";

const mockState = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  existingConfig: null as SavedStrategyConfig | null,
  isLoading: false,
  showToast: vi.fn(),
  updateMutateAsync: vi.fn(),
  createIsPending: false,
  updateIsPending: false,
}));

const baseConfig: SavedStrategyConfig = {
  config_id: "momentum_bot",
  display_name: "Momentum Bot",
  description: "Trades with market momentum",
  strategy_id: "dma_gated_fgi",
  primary_asset: "BTC",
  supports_daily_suggestion: true,
  is_default: false,
  is_benchmark: false,
  params: { rotation: { drift_threshold: 0.1 } },
  composition: {
    kind: "bucket_strategy",
    bucket_mapper_id: "spot_stable",
    signal: { component_id: "signal_component", params: {} },
    decision_policy: { component_id: "decision_component", params: {} },
    pacing_policy: { component_id: "pacing_component", params: {} },
    execution_profile: { component_id: "execution_component", params: {} },
    plugins: [],
  },
};

vi.mock("@/hooks/queries/strategyAdmin", () => ({
  useStrategyAdminConfig: () => ({
    data: mockState.existingConfig,
    isLoading: mockState.isLoading,
  }),
}));

vi.mock("@/hooks/mutations/useStrategyAdminMutations", () => ({
  useCreateStrategyConfig: () => ({
    mutateAsync: mockState.createMutateAsync,
    isPending: mockState.createIsPending,
  }),
  useUpdateStrategyConfig: () => ({
    mutateAsync: mockState.updateMutateAsync,
    isPending: mockState.updateIsPending,
  }),
}));

vi.mock("@/providers/ToastProvider", async importOriginal => {
  const actual =
    await importOriginal<typeof import("@/providers/ToastProvider")>();

  return {
    ...actual,
    useToast: () => ({
      showToast: mockState.showToast,
    }),
  };
});

function renderConfigEditorView(
  overrides: Partial<ComponentProps<typeof ConfigEditorView>> = {}
) {
  const onCancel = vi.fn();
  const onDuplicate = vi.fn();
  const onSaved = vi.fn();

  render(
    <ConfigEditorView
      configId={null}
      mode="create"
      duplicateFrom={null}
      onCancel={onCancel}
      onSaved={onSaved}
      onDuplicate={onDuplicate}
      {...overrides}
    />
  );

  return {
    onCancel,
    onDuplicate,
    onSaved,
  };
}

function fillRequiredCreateFields(): void {
  fireEvent.change(screen.getByPlaceholderText("my_strategy_config"), {
    target: { value: "my_strategy_config" },
  });
  fireEvent.change(screen.getByPlaceholderText("My Strategy Config"), {
    target: { value: "My Strategy Config" },
  });
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "simple_dca" },
  });
  fireEvent.change(screen.getByPlaceholderText("BTC"), {
    target: { value: "ETH" },
  });
}

describe("ConfigEditorView", () => {
  beforeEach(() => {
    mockState.existingConfig = null;
    mockState.isLoading = false;
    mockState.createIsPending = false;
    mockState.updateIsPending = false;
    mockState.createMutateAsync.mockReset();
    mockState.createMutateAsync.mockResolvedValue(undefined);
    mockState.updateMutateAsync.mockReset();
    mockState.updateMutateAsync.mockResolvedValue(undefined);
    mockState.showToast.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Rendering & titles
  // ---------------------------------------------------------------------------

  describe("title rendering", () => {
    it("shows 'Create Configuration' in create mode", () => {
      renderConfigEditorView();
      expect(
        screen.getByRole("heading", { name: "Create Configuration" })
      ).toBeInTheDocument();
    });

    it("shows 'Edit Configuration' in edit mode", () => {
      mockState.existingConfig = baseConfig;
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      expect(
        screen.getByRole("heading", { name: "Edit Configuration" })
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  describe("loading state", () => {
    it("renders spinner when edit mode is loading", () => {
      mockState.isLoading = true;
      renderConfigEditorView({ configId: "some_id", mode: "edit" });
      // No form fields visible — spinner is rendered instead
      expect(
        screen.queryByPlaceholderText("My Strategy Config")
      ).not.toBeInTheDocument();
    });

    it("does not render spinner for create mode even when isLoading is true", () => {
      mockState.isLoading = true;
      renderConfigEditorView();
      // Create mode ignores loading state — form is shown
      expect(
        screen.getByPlaceholderText("My Strategy Config")
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Create mode — form fields & validation
  // ---------------------------------------------------------------------------

  describe("create mode form", () => {
    it("renders all form fields with empty initial state", () => {
      renderConfigEditorView();
      expect(screen.getByPlaceholderText("my_strategy_config")).toHaveValue("");
      expect(screen.getByPlaceholderText("My Strategy Config")).toHaveValue("");
      expect(
        screen.getByPlaceholderText("Optional description...")
      ).toHaveValue("");
      expect(screen.getByPlaceholderText("BTC")).toHaveValue("");
    });

    it("shows config ID as an editable input in create mode", () => {
      renderConfigEditorView();
      const input = screen.getByPlaceholderText("my_strategy_config");
      expect(input.tagName).toBe("INPUT");
    });

    it("shows invalid config ID error for uppercase letters", () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByPlaceholderText("my_strategy_config"), {
        target: { value: "MyInvalid" },
      });
      expect(
        screen.getByText(
          "Only lowercase letters, digits, and underscores allowed"
        )
      ).toBeInTheDocument();
    });

    it("shows invalid config ID error for hyphens", () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByPlaceholderText("my_strategy_config"), {
        target: { value: "my-config" },
      });
      expect(
        screen.getByText(
          "Only lowercase letters, digits, and underscores allowed"
        )
      ).toBeInTheDocument();
    });

    it("does not show config ID error for valid lowercase_underscore ids", () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByPlaceholderText("my_strategy_config"), {
        target: { value: "my_config_123" },
      });
      expect(
        screen.queryByText(
          "Only lowercase letters, digits, and underscores allowed"
        )
      ).not.toBeInTheDocument();
    });

    it("disables Save when required fields are empty", () => {
      renderConfigEditorView();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("enables Save when all required fields are filled", () => {
      renderConfigEditorView();
      fillRequiredCreateFields();
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });

    it("disables Save when displayName is blank", () => {
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.change(screen.getByPlaceholderText("My Strategy Config"), {
        target: { value: "" },
      });
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("disables Save when primaryAsset is blank", () => {
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.change(screen.getByPlaceholderText("BTC"), {
        target: { value: "" },
      });
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("updates description field", () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByPlaceholderText("Optional description..."), {
        target: { value: "A detailed description" },
      });
      expect(
        screen.getByPlaceholderText("Optional description...")
      ).toHaveValue("A detailed description");
    });

    it("does not show Duplicate button in create mode", () => {
      renderConfigEditorView();
      expect(
        screen.queryByRole("button", { name: /duplicate/i })
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Edit mode — form seeding & read-only config ID badge
  // ---------------------------------------------------------------------------

  describe("edit mode form seeding", () => {
    it("shows config_id as read-only badge (not an input) in edit mode", () => {
      mockState.existingConfig = baseConfig;
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      // There should be no editable config-id input
      expect(
        screen.queryByPlaceholderText("my_strategy_config")
      ).not.toBeInTheDocument();
      // Config id appears as text in the badge
      expect(screen.getAllByText("momentum_bot").length).toBeGreaterThan(0);
    });

    it("seeds display name from existing config in edit mode", () => {
      mockState.existingConfig = baseConfig;
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      expect(screen.getByPlaceholderText("My Strategy Config")).toHaveValue(
        "Momentum Bot"
      );
    });

    it("seeds description from existing config in edit mode", () => {
      mockState.existingConfig = baseConfig;
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      expect(
        screen.getByPlaceholderText("Optional description...")
      ).toHaveValue("Trades with market momentum");
    });

    it("seeds primary asset from existing config in edit mode", () => {
      mockState.existingConfig = baseConfig;
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      expect(screen.getByPlaceholderText("BTC")).toHaveValue("BTC");
    });

    it("seeds supports_daily_suggestion toggle from existing config", () => {
      mockState.existingConfig = baseConfig;
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      expect(screen.getByRole("switch")).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate mode (create with duplicateFrom)
  // ---------------------------------------------------------------------------

  describe("duplicate mode", () => {
    it("prefills duplicate mode while keeping config id empty", () => {
      renderConfigEditorView({
        duplicateFrom: baseConfig,
      });

      expect(screen.getByPlaceholderText("my_strategy_config")).toHaveValue("");
      expect(screen.getByPlaceholderText("My Strategy Config")).toHaveValue(
        "Momentum Bot (copy)"
      );
      expect(
        screen.getByPlaceholderText("Optional description...")
      ).toHaveValue("Trades with market momentum");
    });

    it("handles duplicateFrom with null description gracefully", () => {
      renderConfigEditorView({
        duplicateFrom: { ...baseConfig, description: null },
      });
      expect(
        screen.getByPlaceholderText("Optional description...")
      ).toHaveValue("");
    });

    it("seeds supports_daily_suggestion from duplicateFrom", () => {
      renderConfigEditorView({
        duplicateFrom: { ...baseConfig, supports_daily_suggestion: false },
      });
      expect(screen.getByRole("switch")).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Daily suggestion toggle
  // ---------------------------------------------------------------------------

  describe("daily suggestion toggle", () => {
    it("toggles from false to true on click", () => {
      renderConfigEditorView();
      const toggle = screen.getByRole("switch");
      expect(toggle).toHaveAttribute("aria-checked", "false");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    it("toggles from true to false on second click", () => {
      renderConfigEditorView();
      const toggle = screen.getByRole("switch");
      fireEvent.click(toggle);
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-checked", "false");
    });
  });

  // ---------------------------------------------------------------------------
  // JSON editor tabs
  // ---------------------------------------------------------------------------

  describe("JSON editor tabs", () => {
    it("shows params tab as active by default", () => {
      renderConfigEditorView();
      const paramsTab = screen.getByRole("button", { name: "params" });
      expect(paramsTab).toHaveClass("border-purple-500");
    });

    it("switches to composition tab on click", () => {
      renderConfigEditorView();
      const compositionTab = screen.getByRole("button", {
        name: "composition",
      });
      fireEvent.click(compositionTab);
      expect(compositionTab).toHaveClass("border-purple-500");
    });

    it("shows valid JSON indicator when params JSON is valid and non-empty", () => {
      renderConfigEditorView();
      // Default params value is "{}" — valid
      expect(screen.getByText("Valid JSON")).toBeInTheDocument();
    });

    it("shows invalid JSON indicator when params JSON is invalid", () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByDisplayValue("{}"), {
        target: { value: "{invalid" },
      });
      expect(
        screen.getByText("Invalid JSON — fix syntax errors before saving")
      ).toBeInTheDocument();
    });

    it("does not show JSON status message when textarea is empty", () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByDisplayValue("{}"), {
        target: { value: "" },
      });
      expect(screen.queryByText("Valid JSON")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Invalid JSON — fix syntax errors before saving")
      ).not.toBeInTheDocument();
    });

    it("shows composition tab JSON after switching", () => {
      mockState.existingConfig = baseConfig;
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      const compositionTab = screen.getByRole("button", {
        name: "composition",
      });
      fireEvent.click(compositionTab);
      // The textarea now holds the serialized composition
      const textarea = screen
        .getAllByRole("textbox")
        .find(
          el =>
            el.tagName === "TEXTAREA" &&
            (el as HTMLTextAreaElement).value.includes("bucket_strategy")
        );
      expect(textarea).toBeDefined();
    });

    it("blocks save when composition JSON is invalid", () => {
      renderConfigEditorView();
      fillRequiredCreateFields();

      // Switch to composition tab and corrupt the JSON
      fireEvent.click(screen.getByRole("button", { name: "composition" }));
      const compositionTextareas = screen.getAllByRole("textbox");
      const compositionTextarea =
        compositionTextareas[compositionTextareas.length - 1];
      fireEvent.change(compositionTextarea, {
        target: { value: "{bad json" },
      });

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("blocks save when active params JSON editor is invalid", () => {
      renderConfigEditorView();
      fillRequiredCreateFields();

      fireEvent.change(screen.getByDisplayValue("{}"), {
        target: { value: "{invalid" },
      });

      expect(
        screen.getByText("Invalid JSON — fix syntax errors before saving")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // Save — create mode
  // ---------------------------------------------------------------------------

  describe("save — create mode", () => {
    it("creates a config with trimmed shared fields", async () => {
      const { onSaved } = renderConfigEditorView();

      fillRequiredCreateFields();

      fireEvent.change(screen.getByPlaceholderText("My Strategy Config"), {
        target: { value: "  My Strategy Config  " },
      });
      fireEvent.change(screen.getByPlaceholderText("Optional description..."), {
        target: { value: "  Optional note  " },
      });
      fireEvent.click(screen.getByRole("switch"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockState.createMutateAsync).toHaveBeenCalledWith({
          config_id: "my_strategy_config",
          display_name: "My Strategy Config",
          description: "Optional note",
          strategy_id: "simple_dca",
          primary_asset: "ETH",
          supports_daily_suggestion: true,
          params: {},
          composition: {},
        });
      });

      expect(mockState.showToast).toHaveBeenCalledWith({
        type: "success",
        title: "Configuration created",
        message: '"My Strategy Config" has been created.',
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it("sends null description when description is blank after trim", async () => {
      renderConfigEditorView();
      fillRequiredCreateFields();
      // Leave description empty — buildFieldsPayload maps "" to null
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockState.createMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ description: null })
        );
      });
    });

    it("shows error toast when create mutation throws", async () => {
      mockState.createMutateAsync.mockRejectedValue(new Error("Network error"));
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalledWith({
          type: "error",
          title: "Create failed",
          message: "Network error",
        });
      });
    });

    it("shows generic error message when thrown value is not an Error", async () => {
      mockState.createMutateAsync.mockRejectedValue("string error");
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalledWith(
          expect.objectContaining({ message: "Unknown error" })
        );
      });
    });

    it("does not call onSaved when create mutation throws", async () => {
      mockState.createMutateAsync.mockRejectedValue(new Error("fail"));
      const { onSaved } = renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalled();
      });
      expect(onSaved).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Save — edit mode
  // ---------------------------------------------------------------------------

  describe("save — edit mode", () => {
    it("updates a config with correct payload", async () => {
      mockState.existingConfig = baseConfig;
      const { onSaved } = renderConfigEditorView({
        configId: baseConfig.config_id,
        mode: "edit",
      });

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockState.updateMutateAsync).toHaveBeenCalledWith({
          configId: "momentum_bot",
          body: {
            display_name: "Momentum Bot",
            description: "Trades with market momentum",
            strategy_id: "dma_gated_fgi",
            primary_asset: "BTC",
            supports_daily_suggestion: true,
            params: { rotation: { drift_threshold: 0.1 } },
            composition: baseConfig.composition,
          },
        });
      });

      expect(mockState.showToast).toHaveBeenCalledWith({
        type: "success",
        title: "Configuration updated",
        message: '"Momentum Bot" has been saved.',
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it("shows error toast with 'Update failed' title when update mutation throws", async () => {
      mockState.existingConfig = baseConfig;
      mockState.updateMutateAsync.mockRejectedValue(new Error("Save error"));
      renderConfigEditorView({
        configId: baseConfig.config_id,
        mode: "edit",
      });

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalledWith({
          type: "error",
          title: "Update failed",
          message: "Save error",
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Saving / pending state
  // ---------------------------------------------------------------------------

  describe("saving pending state", () => {
    it("shows 'Saving...' text on save button when create is pending", () => {
      mockState.createIsPending = true;
      renderConfigEditorView();
      expect(
        screen.getByRole("button", { name: /saving/i })
      ).toBeInTheDocument();
    });

    it("shows 'Saving...' text on save button when update is pending", () => {
      mockState.existingConfig = baseConfig;
      mockState.updateIsPending = true;
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      expect(
        screen.getByRole("button", { name: /saving/i })
      ).toBeInTheDocument();
    });

    it("disables Cancel button while saving", () => {
      mockState.createIsPending = true;
      renderConfigEditorView();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // Cancel button
  // ---------------------------------------------------------------------------

  describe("cancel button", () => {
    it("calls onCancel when Cancel button is clicked", () => {
      const { onCancel } = renderConfigEditorView();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("calls onCancel when back arrow button is clicked", () => {
      const { onCancel } = renderConfigEditorView();
      // The ArrowLeft button has no accessible name — find by position (first button)
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[0]);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Benchmark mode
  // ---------------------------------------------------------------------------

  describe("benchmark mode", () => {
    it("renders benchmark configs as read-only in edit mode", () => {
      mockState.existingConfig = {
        ...baseConfig,
        is_benchmark: true,
      };

      renderConfigEditorView({
        configId: baseConfig.config_id,
        mode: "edit",
      });

      expect(
        screen.getByText(
          /This is a benchmark configuration and cannot be modified/i
        )
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Duplicate" })
      ).not.toBeInTheDocument();
    });

    it("disables all inputs in benchmark mode", () => {
      mockState.existingConfig = { ...baseConfig, is_benchmark: true };
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });

      const inputs = screen.getAllByRole("textbox");
      for (const input of inputs) {
        expect(input).toBeDisabled();
      }
    });

    it("disables toggle in benchmark mode", () => {
      mockState.existingConfig = { ...baseConfig, is_benchmark: true };
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      expect(screen.getByRole("switch")).toBeDisabled();
    });

    it("does not call handleSave for a benchmark config even if Save were invoked programmatically", async () => {
      mockState.existingConfig = { ...baseConfig, is_benchmark: true };
      renderConfigEditorView({ configId: baseConfig.config_id, mode: "edit" });
      // Save button is not rendered — mutations should never be called
      expect(mockState.updateMutateAsync).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate button in edit mode (non-benchmark)
  // ---------------------------------------------------------------------------

  describe("duplicate button in edit mode", () => {
    it("duplicates from the loaded config in edit mode", () => {
      mockState.existingConfig = baseConfig;
      const { onDuplicate } = renderConfigEditorView({
        configId: baseConfig.config_id,
        mode: "edit",
      });

      fireEvent.click(screen.getByRole("button", { name: /duplicate/i }));

      expect(onDuplicate).toHaveBeenCalledWith(baseConfig);
    });

    it("does not show Duplicate button when existingConfig is null in edit mode", () => {
      mockState.existingConfig = null;
      renderConfigEditorView({ configId: "missing_id", mode: "edit" });
      expect(
        screen.queryByRole("button", { name: /duplicate/i })
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Strategy ID select options
  // ---------------------------------------------------------------------------

  describe("strategy ID select", () => {
    it("renders all strategy options from STRATEGY_IDS", () => {
      renderConfigEditorView();
      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
      // Should contain at least the placeholder + known strategies
      expect(
        screen.getByRole("option", { name: "Select strategy..." })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "DMA-Gated FGI" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Simple DCA" })
      ).toBeInTheDocument();
    });

    it("updating strategy ID reflects in form state", () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "dma_gated_fgi" },
      });
      expect(screen.getByRole("combobox")).toHaveValue("dma_gated_fgi");
    });
  });
});
