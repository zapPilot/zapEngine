import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigListView } from '@/components/wallet/portfolio/views/invest/configManager/ConfigListView';
import type { SavedStrategyConfig } from '@/types';

import { fireEvent, render, screen, waitFor } from '../../../test-utils';

// ---------------------------------------------------------------------------
// Shared mutable state hoisted so mock factories can reference it
// ---------------------------------------------------------------------------
const mockState = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  showToast: vi.fn(),
}));

vi.mock('@/hooks/mutations/useStrategyAdminMutations', () => ({
  useSetDefaultStrategyConfig: () => ({
    mutateAsync: mockState.mutateAsync,
    isPending: mockState.isPending,
  }),
}));

vi.mock('@/providers/ToastProvider', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/providers/ToastProvider')>();
  return {
    ...actual,
    useToast: () => ({ showToast: mockState.showToast }),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseComposition: SavedStrategyConfig['composition'] = {
  kind: 'bucket_strategy',
  bucket_mapper_id: 'spot_stable',
  signal: { component_id: 'dma_signal', params: {} },
  decision_policy: { component_id: 'fgi_tiered_decision', params: {} },
  pacing_policy: { component_id: 'weekly_pacing', params: {} },
  execution_profile: { component_id: 'single_asset_execution', params: {} },
  plugins: [],
};

const defaultConfig: SavedStrategyConfig = {
  config_id: 'dma_default',
  display_name: 'DMA Default',
  description: 'Default DMA strategy',
  strategy_id: 'dma_gated_fgi',
  primary_asset: 'BTC',
  supports_daily_suggestion: true,
  is_default: true,
  is_benchmark: false,
  params: {},
  composition: baseComposition,
};

const benchmarkConfig: SavedStrategyConfig = {
  config_id: 'dca_classic_benchmark',
  display_name: 'DCA Classic',
  description: 'Benchmark config',
  strategy_id: 'simple_dca',
  primary_asset: 'BTC',
  supports_daily_suggestion: false,
  is_default: false,
  is_benchmark: true,
  params: {},
  composition: baseComposition,
};

const nonDefaultConfig: SavedStrategyConfig = {
  config_id: 'eth_rotation',
  display_name: 'ETH Rotation',
  description: null,
  strategy_id: 'dma_gated_fgi',
  primary_asset: 'ETH',
  supports_daily_suggestion: true,
  is_default: false,
  is_benchmark: false,
  params: {},
  composition: baseComposition,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderConfigListView(
  configs: SavedStrategyConfig[] = [defaultConfig, benchmarkConfig],
  handlers: {
    onEdit?: ReturnType<typeof vi.fn>;
    onDuplicate?: ReturnType<typeof vi.fn>;
    onCreate?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onEdit = handlers.onEdit ?? vi.fn();
  const onDuplicate = handlers.onDuplicate ?? vi.fn();
  const onCreate = handlers.onCreate ?? vi.fn();

  render(
    <ConfigListView
      configs={configs}
      onEdit={onEdit}
      onDuplicate={onDuplicate}
      onCreate={onCreate}
    />,
  );

  return { onEdit, onDuplicate, onCreate };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ConfigListView', () => {
  beforeEach(() => {
    mockState.mutateAsync.mockReset();
    mockState.mutateAsync.mockResolvedValue(undefined);
    mockState.showToast.mockReset();
    mockState.isPending = false;
  });

  // -------------------------------------------------------------------------
  // Render basics
  // -------------------------------------------------------------------------
  describe('basic rendering', () => {
    it('renders the section heading', () => {
      renderConfigListView();
      expect(screen.getByText('Strategy Configurations')).toBeDefined();
    });

    it('renders Create New button', () => {
      renderConfigListView();
      expect(screen.getByText('Create New')).toBeDefined();
    });

    it('renders config display names', () => {
      renderConfigListView();
      expect(screen.getAllByText('DMA Default').length).toBeGreaterThan(0);
      expect(screen.getAllByText('DCA Classic').length).toBeGreaterThan(0);
    });

    it('renders config IDs', () => {
      renderConfigListView();
      expect(screen.getAllByText('dma_default').length).toBeGreaterThan(0);
      expect(
        screen.getAllByText('dca_classic_benchmark').length,
      ).toBeGreaterThan(0);
    });

    it('renders strategy_id and primary_asset', () => {
      renderConfigListView([nonDefaultConfig]);
      expect(screen.getAllByText('dma_gated_fgi').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ETH').length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('shows empty state message when configs array is empty', () => {
      renderConfigListView([]);
      expect(screen.getByText('No configurations found.')).toBeDefined();
    });

    it('does not show empty state when configs are present', () => {
      renderConfigListView();
      expect(screen.queryByText('No configurations found.')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Status badges
  // -------------------------------------------------------------------------
  describe('status badges', () => {
    it('shows Default badge for the default config', () => {
      renderConfigListView();
      expect(screen.getAllByText('Default').length).toBeGreaterThan(0);
    });

    it('shows Benchmark badge for benchmark configs', () => {
      renderConfigListView();
      expect(screen.getAllByText('Benchmark').length).toBeGreaterThan(0);
    });

    it('shows Daily badge for configs supporting daily suggestion', () => {
      renderConfigListView();
      expect(screen.getAllByText('Daily').length).toBeGreaterThan(0);
    });

    it('does not show Default badge for non-default configs', () => {
      renderConfigListView([benchmarkConfig]);
      expect(screen.queryByText('Default')).toBeNull();
    });

    it('does not show Benchmark badge for non-benchmark configs', () => {
      renderConfigListView([defaultConfig]);
      expect(screen.queryByText('Benchmark')).toBeNull();
    });

    it('does not show Daily badge when supports_daily_suggestion is false', () => {
      renderConfigListView([benchmarkConfig]);
      expect(screen.queryByText('Daily')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------
  describe('action handlers', () => {
    it('calls onCreate when Create New is clicked', () => {
      const onCreate = vi.fn();
      renderConfigListView([defaultConfig], { onCreate });
      fireEvent.click(screen.getByText('Create New'));
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it('calls onEdit with correct configId when Edit is clicked', () => {
      const onEdit = vi.fn();
      renderConfigListView([nonDefaultConfig], { onEdit });
      // Use title="Edit" buttons; both desktop and mobile render
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);
      expect(onEdit).toHaveBeenCalledWith('eth_rotation');
    });

    it('calls onDuplicate with the full config when Duplicate is clicked', () => {
      const onDuplicate = vi.fn();
      renderConfigListView([nonDefaultConfig], { onDuplicate });
      const duplicateButtons = screen.getAllByTitle('Duplicate');
      fireEvent.click(duplicateButtons[0]);
      expect(onDuplicate).toHaveBeenCalledWith(nonDefaultConfig);
    });

    it('does not render Edit/Duplicate buttons for benchmark configs', () => {
      renderConfigListView([benchmarkConfig]);
      expect(screen.queryByTitle('Edit')).toBeNull();
      expect(screen.queryByTitle('Duplicate')).toBeNull();
    });

    it('shows Set Default button for non-default configs that support daily suggestion', () => {
      renderConfigListView([nonDefaultConfig]);
      expect(screen.getAllByTitle('Set as Default').length).toBeGreaterThan(0);
    });

    it('does not show Set Default button for the current default config', () => {
      renderConfigListView([defaultConfig]);
      expect(screen.queryByTitle('Set as Default')).toBeNull();
    });

    it('does not show Set Default button when supports_daily_suggestion is false', () => {
      const config: SavedStrategyConfig = {
        ...nonDefaultConfig,
        supports_daily_suggestion: false,
      };
      renderConfigListView([config]);
      expect(screen.queryByTitle('Set as Default')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Set Default confirmation modal
  // -------------------------------------------------------------------------
  describe('set default confirmation modal', () => {
    it('opens the confirmation modal when Set as Default is clicked', () => {
      renderConfigListView([defaultConfig, nonDefaultConfig]);
      const setDefaultButtons = screen.getAllByTitle('Set as Default');
      fireEvent.click(setDefaultButtons[0]);
      expect(screen.getByText('Change Default Configuration')).toBeDefined();
    });

    it('shows current default name and target config name in the modal', () => {
      renderConfigListView([defaultConfig, nonDefaultConfig]);
      const setDefaultButtons = screen.getAllByTitle('Set as Default');
      fireEvent.click(setDefaultButtons[0]);
      expect(screen.getAllByText('DMA Default').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ETH Rotation').length).toBeGreaterThan(0);
    });

    it('closes the modal when Cancel is clicked', async () => {
      renderConfigListView([defaultConfig, nonDefaultConfig]);
      fireEvent.click(screen.getAllByTitle('Set as Default')[0]);
      expect(screen.getByText('Change Default Configuration')).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.queryByText('Change Default Configuration')).toBeNull();
      });
    });

    it('calls mutateAsync with configId and shows success toast on confirm', async () => {
      renderConfigListView([defaultConfig, nonDefaultConfig]);
      fireEvent.click(screen.getAllByTitle('Set as Default')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(mockState.mutateAsync).toHaveBeenCalledWith('eth_rotation');
      });
      expect(mockState.showToast).toHaveBeenCalledWith({
        type: 'success',
        title: 'Default updated',
        message: '"ETH Rotation" is now the default configuration.',
      });
    });

    it('closes the modal after a successful set-default', async () => {
      renderConfigListView([defaultConfig, nonDefaultConfig]);
      fireEvent.click(screen.getAllByTitle('Set as Default')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(screen.queryByText('Change Default Configuration')).toBeNull();
      });
    });

    it('shows error toast when mutateAsync rejects', async () => {
      mockState.mutateAsync.mockRejectedValue(new Error('Network failure'));
      renderConfigListView([defaultConfig, nonDefaultConfig]);
      fireEvent.click(screen.getAllByTitle('Set as Default')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalledWith({
          type: 'error',
          title: 'Failed to set default',
          message: 'Network failure',
        });
      });
    });

    it('shows generic error message for non-Error rejections', async () => {
      mockState.mutateAsync.mockRejectedValue('oops');
      renderConfigListView([defaultConfig, nonDefaultConfig]);
      fireEvent.click(screen.getAllByTitle('Set as Default')[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Unknown error' }),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Multiple configs
  // -------------------------------------------------------------------------
  describe('multiple configs', () => {
    it('renders all provided configs', () => {
      renderConfigListView([defaultConfig, benchmarkConfig, nonDefaultConfig]);
      expect(screen.getAllByText('DMA Default').length).toBeGreaterThan(0);
      expect(screen.getAllByText('DCA Classic').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ETH Rotation').length).toBeGreaterThan(0);
    });
  });
});
