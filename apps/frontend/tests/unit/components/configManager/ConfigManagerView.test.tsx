import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigManagerView } from "@/components/wallet/portfolio/views/invest/configManager";
import { useStrategyAdminConfigs } from "@/hooks/queries/strategyAdmin";

import { fireEvent, render, screen, waitFor } from "../../../test-utils";

const { mockConfigs } = vi.hoisted(() => ({
  mockConfigs: [
    {
      config_id: "dma_default",
      display_name: "DMA Default",
      description: "Default DMA strategy",
      strategy_id: "dma_gated_fgi",
      primary_asset: "BTC",
      supports_daily_suggestion: true,
      is_default: true,
      is_benchmark: false,
      params: {},
      composition: {
        kind: "bucket_strategy",
        bucket_mapper_id: "spot_stable",
        signal: { component_id: "dma_gated_fgi_signal", params: {} },
        decision_policy: { component_id: "fgi_tiered_decision", params: {} },
        pacing_policy: { component_id: "weekly_pacing", params: {} },
        execution_profile: {
          component_id: "single_asset_execution",
          params: {},
        },
        plugins: [],
      },
    },
    {
      config_id: "dca_classic_benchmark",
      display_name: "DCA Classic",
      description: "Benchmark config",
      strategy_id: "simple_dca",
      primary_asset: "BTC",
      supports_daily_suggestion: false,
      is_default: false,
      is_benchmark: true,
      params: {},
      composition: {
        kind: "bucket_strategy",
        bucket_mapper_id: "spot_stable",
        signal: { component_id: "always_buy_signal", params: {} },
        decision_policy: { component_id: "fixed_decision", params: {} },
        pacing_policy: { component_id: "weekly_pacing", params: {} },
        execution_profile: {
          component_id: "single_asset_execution",
          params: {},
        },
        plugins: [],
      },
    },
  ],
}));

vi.mock("@/hooks/queries/strategyAdmin", () => ({
  useStrategyAdminConfigs: vi.fn(),
  useStrategyAdminConfig: vi.fn(() => ({
    data: null,
    isLoading: false,
  })),
}));

vi.mock("@/hooks/mutations/useStrategyAdminMutations", () => ({
  useCreateStrategyConfig: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateStrategyConfig: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSetDefaultStrategyConfig: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe("ConfigManagerView", () => {
  beforeEach(() => {
    vi.mocked(useStrategyAdminConfigs).mockReturnValue({
      data: mockConfigs,
      isLoading: false,
      error: null,
    });
  });

  it("renders the config list with all configs", () => {
    render(<ConfigManagerView />);

    expect(screen.getByText("Strategy Configurations")).toBeDefined();
    expect(screen.getAllByText("DMA Default").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DCA Classic").length).toBeGreaterThan(0);
  });

  it("shows Default badge on the default config", () => {
    render(<ConfigManagerView />);

    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
  });

  it("shows Benchmark badge on benchmark configs", () => {
    render(<ConfigManagerView />);

    expect(screen.getAllByText("Benchmark").length).toBeGreaterThan(0);
  });

  it("shows Daily badge on configs supporting daily suggestion", () => {
    render(<ConfigManagerView />);

    expect(screen.getAllByText("Daily").length).toBeGreaterThan(0);
  });

  it("renders Create New button", () => {
    render(<ConfigManagerView />);

    expect(screen.getByText("Create New")).toBeDefined();
  });

  it("navigates to create editor when Create New is clicked", async () => {
    render(<ConfigManagerView />);

    fireEvent.click(screen.getByText("Create New"));

    await waitFor(() => {
      expect(screen.getByText("Create Configuration")).toBeDefined();
    });
  });

  it("shows loading state", () => {
    vi.mocked(useStrategyAdminConfigs).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<ConfigManagerView />);
    // Check if spinner exists (implicitly by checking if we don't see the list)
    expect(screen.queryByText("Strategy Configurations")).toBeNull();
  });

  it("shows error state", () => {
    vi.mocked(useStrategyAdminConfigs).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("Failed to fetch configs"),
    });

    render(<ConfigManagerView />);
    expect(screen.getByText(/Failed to load configurations/i)).toBeDefined();
    expect(screen.getByText(/Failed to fetch configs/i)).toBeDefined();
  });

  it("navigates to edit editor when Edit is clicked", async () => {
    render(<ConfigManagerView />);

    // Find edit button for DMA Default. We use the button text if available or a role.
    // In ConfigListView, it's likely an Edit button.
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Edit Configuration")).toBeDefined();
    });
  });

  it("navigates to duplicate editor when Duplicate is clicked", async () => {
    render(<ConfigManagerView />);

    const duplicateButtons = screen.getAllByRole("button", {
      name: /duplicate/i,
    });
    fireEvent.click(duplicateButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Create Configuration")).toBeDefined();
      // Should also show "Duplicating from..." or similar if implemented in ConfigEditorView
    });
  });

  it("navigates back to list when Cancel is clicked in editor", async () => {
    render(<ConfigManagerView />);

    fireEvent.click(screen.getByText("Create New"));

    await waitFor(() => {
      expect(screen.getByText("Create Configuration")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.getByText("Strategy Configurations")).toBeDefined();
    });
  });

  it("shows Unknown error when error is not an Error instance", () => {
    vi.mocked(useStrategyAdminConfigs).mockReturnValue({
      data: null,
      isLoading: false,
      error: "raw string error",
    });

    render(<ConfigManagerView />);
    expect(screen.getByText(/Failed to load configurations/i)).toBeDefined();
    expect(screen.getByText(/Unknown error/)).toBeDefined();
  });

  it("transitions to editor view with duplicateFrom config when Duplicate is clicked", async () => {
    render(<ConfigManagerView />);

    const duplicateButtons = screen.getAllByRole("button", {
      name: /duplicate/i,
    });
    fireEvent.click(duplicateButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Create Configuration")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.getByText("Strategy Configurations")).toBeDefined();
    });
  });
});
