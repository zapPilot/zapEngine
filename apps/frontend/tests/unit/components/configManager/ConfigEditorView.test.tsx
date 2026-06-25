import type { SavedStrategyConfig } from '@zapengine/app-core/types';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigEditorView } from '@/components/wallet/portfolio/views/invest/configManager/ConfigEditorView';

import { fireEvent, render, screen, waitFor } from '../../../test-utils';

const mockState = vi.hoisted(() => ({
  createConfig: vi.fn(),
  createMutateAsync: vi.fn(),
  existingConfig: null as SavedStrategyConfig | null,
  getStrategyAdminConfig: vi.fn(),
  getStrategyConfigs: vi.fn(),
  isLoading: false,
  showToast: vi.fn(),
  updateConfig: vi.fn(),
  updateMutateAsync: vi.fn(),
  strategyConfigsData: {
    strategies: [
      {
        strategy_id: 'dma_gated_fgi',
        display_name: 'DMA-Gated FGI',
        description: null,
        param_schema: {},
        default_params: {},
        supports_daily_suggestion: true,
      },
      {
        strategy_id: 'dma_fgi_portfolio_rules',
        display_name: 'DMA/FGI Portfolio Rules',
        description: null,
        param_schema: {},
        default_params: {},
        supports_daily_suggestion: false,
      },
    ],
    presets: [],
    backtest_defaults: { days: 500, total_capital: 10000 },
    portfolio_rules: [
      {
        name: 'cross_down_exit',
        priority: 10,
        description: 'Exit any asset that crosses below DMA.',
        default_enabled: true,
      },
      {
        name: 'extreme_fear_dca_buy',
        priority: 40,
        description: 'DCA buy assets when their relevant FGI is extreme fear.',
        default_enabled: false,
      },
    ],
  },
  strategyConfigsIsLoading: false,
  strategyConfigsIsError: false,
}));

const baseConfig: SavedStrategyConfig = {
  config_id: 'momentum_bot',
  display_name: 'Momentum Bot',
  description: 'Trades with market momentum',
  strategy_id: 'dma_fgi_portfolio_rules',
  primary_asset: 'BTC',
  supports_daily_suggestion: true,
  is_default: false,
  is_benchmark: false,
  params: {
    disabled_rules: ['extreme_fear_dca_buy'],
    signal: { cross_cooldown_days: 12 },
  },
  composition: {
    kind: 'bucket_strategy',
    bucket_mapper_id: 'spot_stable',
    signal: { component_id: 'signal_component', params: {} },
    decision_policy: { component_id: 'decision_component', params: {} },
    pacing_policy: { component_id: 'pacing_component', params: {} },
    execution_profile: { component_id: 'execution_component', params: {} },
    plugins: [],
  },
};

vi.mock('@zapengine/app-core/services', () => ({
  createStrategyConfig: mockState.createConfig,
  getStrategyAdminConfig: mockState.getStrategyAdminConfig,
  getStrategyConfigs: mockState.getStrategyConfigs,
  updateStrategyConfig: mockState.updateConfig,
}));

vi.mock(
  '@zapengine/app-core/providers/ToastContext',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@zapengine/app-core/providers/ToastContext')
      >();

    return {
      ...actual,
      useToast: () => ({
        showToast: mockState.showToast,
      }),
    };
  },
);

function renderConfigEditorView(
  overrides: Partial<ComponentProps<typeof ConfigEditorView>> = {},
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
    />,
  );

  return {
    onCancel,
    onDuplicate,
    onSaved,
  };
}

function pendingPromise(): Promise<never> {
  return new Promise<never>((resolve) => {
    void resolve;
  });
}

async function renderLoadedEditConfig(
  overrides: Partial<ComponentProps<typeof ConfigEditorView>> = {},
) {
  const result = renderConfigEditorView({
    configId: baseConfig.config_id,
    mode: 'edit',
    ...overrides,
  });

  await screen.findByDisplayValue(
    mockState.existingConfig?.display_name ?? baseConfig.display_name,
  );

  return result;
}

function fillRequiredCreateFields(): void {
  fireEvent.change(screen.getByPlaceholderText('my_strategy_config'), {
    target: { value: 'my_strategy_config' },
  });
  fireEvent.change(screen.getByPlaceholderText('My Strategy Config'), {
    target: { value: 'My Strategy Config' },
  });
  fireEvent.change(screen.getByPlaceholderText('BTC'), {
    target: { value: 'ETH' },
  });
}

describe('ConfigEditorView', () => {
  beforeEach(() => {
    mockState.existingConfig = null;
    mockState.isLoading = false;
    mockState.strategyConfigsIsLoading = false;
    mockState.strategyConfigsIsError = false;
    mockState.createConfig.mockReset();
    mockState.createConfig.mockImplementation((body) =>
      mockState.createMutateAsync(body),
    );
    mockState.createMutateAsync.mockReset();
    mockState.createMutateAsync.mockResolvedValue(undefined);
    mockState.getStrategyAdminConfig.mockReset();
    mockState.getStrategyAdminConfig.mockImplementation(() => {
      if (mockState.isLoading) {
        return pendingPromise();
      }
      return Promise.resolve({ config: mockState.existingConfig });
    });
    mockState.getStrategyConfigs.mockReset();
    mockState.getStrategyConfigs.mockImplementation(() => {
      if (mockState.strategyConfigsIsLoading) {
        return pendingPromise();
      }
      if (mockState.strategyConfigsIsError) {
        return Promise.reject(new Error('Failed to load strategy configs'));
      }
      return Promise.resolve(mockState.strategyConfigsData);
    });
    mockState.updateConfig.mockReset();
    mockState.updateConfig.mockImplementation((configId, body) =>
      mockState.updateMutateAsync({ configId, body }),
    );
    mockState.updateMutateAsync.mockReset();
    mockState.updateMutateAsync.mockResolvedValue(undefined);
    mockState.showToast.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Rendering & titles
  // ---------------------------------------------------------------------------

  describe('title rendering', () => {
    it("shows 'Create Configuration' in create mode", () => {
      renderConfigEditorView();
      expect(
        screen.getByRole('heading', { name: 'Create Configuration' }),
      ).toBeInTheDocument();
    });

    it("shows 'Edit Configuration' in edit mode", async () => {
      mockState.existingConfig = baseConfig;
      await renderLoadedEditConfig();
      expect(
        screen.getByRole('heading', { name: 'Edit Configuration' }),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders spinner when edit mode is loading', () => {
      mockState.isLoading = true;
      renderConfigEditorView({ configId: 'some_id', mode: 'edit' });
      // No form fields visible — spinner is rendered instead
      expect(
        screen.queryByPlaceholderText('My Strategy Config'),
      ).not.toBeInTheDocument();
    });

    it('does not render spinner for create mode even when isLoading is true', () => {
      mockState.isLoading = true;
      renderConfigEditorView();
      // Create mode ignores loading state — form is shown
      expect(
        screen.getByPlaceholderText('My Strategy Config'),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Create mode — form fields & validation
  // ---------------------------------------------------------------------------

  describe('create mode form', () => {
    it('renders all form fields with empty initial state', () => {
      renderConfigEditorView();
      expect(screen.getByPlaceholderText('my_strategy_config')).toHaveValue('');
      expect(screen.getByPlaceholderText('My Strategy Config')).toHaveValue('');
      expect(
        screen.getByPlaceholderText('Optional description...'),
      ).toHaveValue('');
      expect(screen.getByPlaceholderText('BTC')).toHaveValue('');
    });

    it('shows config ID as an editable input in create mode', () => {
      renderConfigEditorView();
      const input = screen.getByPlaceholderText('my_strategy_config');
      expect(input.tagName).toBe('INPUT');
    });

    it('shows invalid config ID error for uppercase letters', () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByPlaceholderText('my_strategy_config'), {
        target: { value: 'MyInvalid' },
      });
      expect(
        screen.getByText(
          'Only lowercase letters, digits, and underscores allowed',
        ),
      ).toBeInTheDocument();
    });

    it('shows invalid config ID error for hyphens', () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByPlaceholderText('my_strategy_config'), {
        target: { value: 'my-config' },
      });
      expect(
        screen.getByText(
          'Only lowercase letters, digits, and underscores allowed',
        ),
      ).toBeInTheDocument();
    });

    it('does not show config ID error for valid lowercase_underscore ids', () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByPlaceholderText('my_strategy_config'), {
        target: { value: 'my_config_123' },
      });
      expect(
        screen.queryByText(
          'Only lowercase letters, digits, and underscores allowed',
        ),
      ).not.toBeInTheDocument();
    });

    it('disables Save when required fields are empty', () => {
      renderConfigEditorView();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('enables Save when all required fields are filled', () => {
      renderConfigEditorView();
      fillRequiredCreateFields();
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });

    it('disables Save when displayName is blank', () => {
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.change(screen.getByPlaceholderText('My Strategy Config'), {
        target: { value: '' },
      });
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('disables Save when primaryAsset is blank', () => {
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.change(screen.getByPlaceholderText('BTC'), {
        target: { value: '' },
      });
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('updates description field', () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByPlaceholderText('Optional description...'), {
        target: { value: 'A detailed description' },
      });
      expect(
        screen.getByPlaceholderText('Optional description...'),
      ).toHaveValue('A detailed description');
    });

    it('does not show Duplicate button in create mode', () => {
      renderConfigEditorView();
      expect(
        screen.queryByRole('button', { name: /duplicate/i }),
      ).not.toBeInTheDocument();
    });

    it('shows locked dma_fgi_portfolio_rules strategy badge instead of a strategy selector', () => {
      renderConfigEditorView();

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText('dma_fgi_portfolio_rules')).toBeInTheDocument();
    });

    it('renders portfolio rule checkboxes from strategy bootstrap metadata', async () => {
      renderConfigEditorView();

      expect(
        await screen.findByRole('checkbox', { name: /extreme_fear_dca_buy/i }),
      ).toBeChecked();
      expect(screen.getByText('P40')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Edit mode — form seeding & read-only config ID badge
  // ---------------------------------------------------------------------------

  describe('edit mode form seeding', () => {
    it('shows config_id as read-only badge (not an input) in edit mode', async () => {
      mockState.existingConfig = baseConfig;
      await renderLoadedEditConfig();
      // There should be no editable config-id input
      expect(
        screen.queryByPlaceholderText('my_strategy_config'),
      ).not.toBeInTheDocument();
      // Config id appears as text in the badge
      expect(screen.getAllByText('momentum_bot').length).toBeGreaterThan(0);
    });

    it('seeds display name from existing config in edit mode', async () => {
      mockState.existingConfig = baseConfig;
      await renderLoadedEditConfig();
      expect(screen.getByPlaceholderText('My Strategy Config')).toHaveValue(
        'Momentum Bot',
      );
    });

    it('seeds description from existing config in edit mode', async () => {
      mockState.existingConfig = baseConfig;
      await renderLoadedEditConfig();
      expect(
        screen.getByPlaceholderText('Optional description...'),
      ).toHaveValue('Trades with market momentum');
    });

    it('seeds primary asset from existing config in edit mode', async () => {
      mockState.existingConfig = baseConfig;
      await renderLoadedEditConfig();
      expect(screen.getByPlaceholderText('BTC')).toHaveValue('BTC');
    });

    it('seeds supports_daily_suggestion toggle from existing config', async () => {
      mockState.existingConfig = baseConfig;
      await renderLoadedEditConfig();
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate mode (create with duplicateFrom)
  // ---------------------------------------------------------------------------

  describe('duplicate mode', () => {
    it('prefills duplicate mode while keeping config id empty', () => {
      renderConfigEditorView({
        duplicateFrom: baseConfig,
      });

      expect(screen.getByPlaceholderText('my_strategy_config')).toHaveValue('');
      expect(screen.getByPlaceholderText('My Strategy Config')).toHaveValue(
        'Momentum Bot (copy)',
      );
      expect(
        screen.getByPlaceholderText('Optional description...'),
      ).toHaveValue('Trades with market momentum');
    });

    it('handles duplicateFrom with null description gracefully', () => {
      renderConfigEditorView({
        duplicateFrom: { ...baseConfig, description: null },
      });
      expect(
        screen.getByPlaceholderText('Optional description...'),
      ).toHaveValue('');
    });

    it('seeds supports_daily_suggestion from duplicateFrom', () => {
      renderConfigEditorView({
        duplicateFrom: { ...baseConfig, supports_daily_suggestion: false },
      });
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-checked',
        'false',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Daily suggestion toggle
  // ---------------------------------------------------------------------------

  describe('daily suggestion toggle', () => {
    it('toggles from false to true on click', () => {
      renderConfigEditorView();
      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('toggles from true to false on second click', () => {
      renderConfigEditorView();
      const toggle = screen.getByRole('switch');
      fireEvent.click(toggle);
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
  });

  // ---------------------------------------------------------------------------
  // JSON editor tabs
  // ---------------------------------------------------------------------------

  describe('JSON editor tabs', () => {
    it('shows params tab as active by default', () => {
      renderConfigEditorView();
      const paramsTab = screen.getByRole('button', { name: 'params' });
      expect(paramsTab).toHaveClass('border-purple-500');
    });

    it('switches to composition tab on click', () => {
      renderConfigEditorView();
      const compositionTab = screen.getByRole('button', {
        name: 'composition',
      });
      fireEvent.click(compositionTab);
      expect(compositionTab).toHaveClass('border-purple-500');
    });

    it('shows valid JSON indicator when params JSON is valid and non-empty', () => {
      renderConfigEditorView();
      // Default params value is "{}" — valid
      expect(screen.getByText('Valid JSON')).toBeInTheDocument();
    });

    it('shows invalid JSON indicator when params JSON is invalid', () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByDisplayValue('{}'), {
        target: { value: '{invalid' },
      });
      expect(
        screen.getByText('Invalid JSON — fix syntax errors before saving'),
      ).toBeInTheDocument();
    });

    it('does not show JSON status message when textarea is empty', () => {
      renderConfigEditorView();
      fireEvent.change(screen.getByDisplayValue('{}'), {
        target: { value: '' },
      });
      expect(screen.queryByText('Valid JSON')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Invalid JSON — fix syntax errors before saving'),
      ).not.toBeInTheDocument();
    });

    it('shows composition tab JSON after switching', async () => {
      mockState.existingConfig = baseConfig;
      await renderLoadedEditConfig();
      const compositionTab = screen.getByRole('button', {
        name: 'composition',
      });
      fireEvent.click(compositionTab);
      // The textarea now holds the serialized composition
      const textarea = screen
        .getAllByRole('textbox')
        .find(
          (el) =>
            el.tagName === 'TEXTAREA' &&
            (el as HTMLTextAreaElement).value.includes('bucket_strategy'),
        );
      expect(textarea).toBeDefined();
    });

    it('blocks save when composition JSON is invalid', () => {
      renderConfigEditorView();
      fillRequiredCreateFields();

      // Switch to composition tab and corrupt the JSON
      fireEvent.click(screen.getByRole('button', { name: 'composition' }));
      const compositionTextareas = screen.getAllByRole('textbox');
      const compositionTextarea =
        compositionTextareas[compositionTextareas.length - 1];
      fireEvent.change(compositionTextarea, {
        target: { value: '{bad json' },
      });

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('blocks save when active params JSON editor is invalid', () => {
      renderConfigEditorView();
      fillRequiredCreateFields();

      fireEvent.change(screen.getByDisplayValue('{}'), {
        target: { value: '{invalid' },
      });

      expect(
        screen.getByText('Invalid JSON — fix syntax errors before saving'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // Save — create mode
  // ---------------------------------------------------------------------------

  describe('save — create mode', () => {
    it('creates a config with trimmed shared fields', async () => {
      const { onSaved } = renderConfigEditorView();

      fillRequiredCreateFields();

      fireEvent.change(screen.getByPlaceholderText('My Strategy Config'), {
        target: { value: '  My Strategy Config  ' },
      });
      fireEvent.change(screen.getByPlaceholderText('Optional description...'), {
        target: { value: '  Optional note  ' },
      });
      fireEvent.click(screen.getByRole('switch'));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockState.createMutateAsync).toHaveBeenCalledWith({
          config_id: 'my_strategy_config',
          display_name: 'My Strategy Config',
          description: 'Optional note',
          strategy_id: 'dma_fgi_portfolio_rules',
          primary_asset: 'ETH',
          supports_daily_suggestion: true,
          params: {},
          composition: {},
        });
      });

      expect(mockState.showToast).toHaveBeenCalledWith({
        type: 'success',
        title: 'Configuration created',
        message: '"My Strategy Config" has been created.',
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('saves unchecked portfolio rules into params and overrides textarea disabled_rules', async () => {
      renderConfigEditorView();
      fillRequiredCreateFields();

      fireEvent.change(screen.getByDisplayValue('{}'), {
        target: {
          value: JSON.stringify(
            {
              disabled_rules: ['cross_down_exit'],
              signal: { cross_cooldown_days: 9 },
            },
            null,
            2,
          ),
        },
      });
      fireEvent.click(
        await screen.findByRole('checkbox', {
          name: /extreme_fear_dca_buy/i,
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockState.createMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            params: {
              disabled_rules: ['extreme_fear_dca_buy'],
              signal: { cross_cooldown_days: 9 },
            },
          }),
        );
      });
    });

    it('sends null description when description is blank after trim', async () => {
      renderConfigEditorView();
      fillRequiredCreateFields();
      // Leave description empty — buildFieldsPayload maps "" to null
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockState.createMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ description: null }),
        );
      });
    });

    it('shows error toast when create mutation throws', async () => {
      mockState.createMutateAsync.mockRejectedValue(new Error('Network error'));
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalledWith({
          type: 'error',
          title: 'Create failed',
          message: 'Network error',
        });
      });
    });

    it('shows generic error message when thrown value is not an Error', async () => {
      mockState.createMutateAsync.mockRejectedValue('string error');
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Unknown error' }),
        );
      });
    });

    it('does not call onSaved when create mutation throws', async () => {
      mockState.createMutateAsync.mockRejectedValue(new Error('fail'));
      const { onSaved } = renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalled();
      });
      expect(onSaved).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Save — edit mode
  // ---------------------------------------------------------------------------

  describe('save — edit mode', () => {
    it('updates a config with correct payload', async () => {
      mockState.existingConfig = baseConfig;
      const { onSaved } = await renderLoadedEditConfig();

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockState.updateMutateAsync).toHaveBeenCalledWith({
          configId: 'momentum_bot',
          body: {
            display_name: 'Momentum Bot',
            description: 'Trades with market momentum',
            strategy_id: 'dma_fgi_portfolio_rules',
            primary_asset: 'BTC',
            supports_daily_suggestion: true,
            params: {
              disabled_rules: ['extreme_fear_dca_buy'],
              signal: { cross_cooldown_days: 12 },
            },
            composition: baseConfig.composition,
          },
        });
      });

      expect(mockState.showToast).toHaveBeenCalledWith({
        type: 'success',
        title: 'Configuration updated',
        message: '"Momentum Bot" has been saved.',
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it("shows error toast with 'Update failed' title when update mutation throws", async () => {
      mockState.existingConfig = baseConfig;
      mockState.updateMutateAsync.mockRejectedValue(new Error('Save error'));
      await renderLoadedEditConfig();

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockState.showToast).toHaveBeenCalledWith({
          type: 'error',
          title: 'Update failed',
          message: 'Save error',
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Saving / pending state
  // ---------------------------------------------------------------------------

  describe('saving pending state', () => {
    it("shows 'Saving...' text on save button when create is pending", async () => {
      mockState.createMutateAsync.mockReturnValue(pendingPromise());
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByRole('button', { name: /saving/i }),
      ).toBeInTheDocument();
    });

    it("shows 'Saving...' text on save button when update is pending", async () => {
      mockState.existingConfig = baseConfig;
      mockState.updateMutateAsync.mockReturnValue(pendingPromise());
      await renderLoadedEditConfig();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByRole('button', { name: /saving/i }),
      ).toBeInTheDocument();
    });

    it('disables Cancel button while saving', async () => {
      mockState.createMutateAsync.mockReturnValue(pendingPromise());
      renderConfigEditorView();
      fillRequiredCreateFields();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Cancel button
  // ---------------------------------------------------------------------------

  describe('cancel button', () => {
    it('calls onCancel when Cancel button is clicked', () => {
      const { onCancel } = renderConfigEditorView();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when back arrow button is clicked', () => {
      const { onCancel } = renderConfigEditorView();
      // The ArrowLeft button has no accessible name — find by position (first button)
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Benchmark mode
  // ---------------------------------------------------------------------------

  describe('benchmark mode', () => {
    it('renders benchmark configs as read-only in edit mode', async () => {
      mockState.existingConfig = {
        ...baseConfig,
        is_benchmark: true,
      };

      await renderLoadedEditConfig();

      expect(
        screen.getByText(
          /This is a benchmark configuration and cannot be modified/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Save' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Duplicate' }),
      ).not.toBeInTheDocument();
    });

    it('disables all inputs in benchmark mode', async () => {
      mockState.existingConfig = { ...baseConfig, is_benchmark: true };
      await renderLoadedEditConfig();

      const inputs = screen.getAllByRole('textbox');
      for (const input of inputs) {
        expect(input).toBeDisabled();
      }
    });

    it('disables toggle in benchmark mode', async () => {
      mockState.existingConfig = { ...baseConfig, is_benchmark: true };
      await renderLoadedEditConfig();
      expect(screen.getByRole('switch')).toBeDisabled();
    });

    it('does not call handleSave for a benchmark config even if Save were invoked programmatically', async () => {
      mockState.existingConfig = { ...baseConfig, is_benchmark: true };
      await renderLoadedEditConfig();
      // Save button is not rendered — mutations should never be called
      expect(mockState.updateMutateAsync).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate button in edit mode (non-benchmark)
  // ---------------------------------------------------------------------------

  describe('duplicate button in edit mode', () => {
    it('duplicates from the loaded config in edit mode', async () => {
      mockState.existingConfig = baseConfig;
      const { onDuplicate } = await renderLoadedEditConfig();

      fireEvent.click(screen.getByRole('button', { name: /duplicate/i }));

      expect(onDuplicate).toHaveBeenCalledWith(baseConfig);
    });

    it('does not show Duplicate button when existingConfig is null in edit mode', async () => {
      mockState.existingConfig = null;
      renderConfigEditorView({ configId: 'missing_id', mode: 'edit' });
      await screen.findByRole('heading', { name: 'Edit Configuration' });
      expect(
        screen.queryByRole('button', { name: /duplicate/i }),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Locked strategy and rules
  // ---------------------------------------------------------------------------

  describe('locked strategy and portfolio rules', () => {
    it('does not render the legacy strategy selector', () => {
      renderConfigEditorView();

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText('dma_fgi_portfolio_rules')).toBeInTheDocument();
    });

    it('seeds disabled rule checkboxes from an existing config', async () => {
      mockState.existingConfig = baseConfig;
      await renderLoadedEditConfig();

      expect(
        await screen.findByRole('checkbox', { name: /extreme_fear_dca_buy/i }),
      ).not.toBeChecked();
      expect(
        screen.getByRole('checkbox', { name: /cross_down_exit/i }),
      ).toBeChecked();
    });

    it('enable all clears disabled rule selections', async () => {
      mockState.existingConfig = baseConfig;
      await renderLoadedEditConfig();
      await screen.findByRole('checkbox', { name: /extreme_fear_dca_buy/i });

      fireEvent.click(screen.getByRole('button', { name: 'Enable all' }));

      expect(
        screen.getByRole('checkbox', { name: /extreme_fear_dca_buy/i }),
      ).toBeChecked();
    });

    it('reset to defaults restores default rule selections', async () => {
      mockState.strategyConfigsData = {
        ...mockState.strategyConfigsData,
        portfolio_rules: [
          ...mockState.strategyConfigsData.portfolio_rules,
          {
            name: 'experimental_rule',
            priority: 60,
            description: 'Experimental rule',
            default_enabled: false,
          },
        ],
      };
      renderConfigEditorView();
      await screen.findByRole('checkbox', { name: /experimental_rule/i });

      fireEvent.click(screen.getByRole('button', { name: 'Enable all' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Reset to defaults' }),
      );

      expect(
        screen.getByRole('checkbox', { name: /experimental_rule/i }),
      ).not.toBeChecked();
    });
  });
});
