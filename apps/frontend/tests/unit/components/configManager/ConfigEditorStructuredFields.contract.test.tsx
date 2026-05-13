// Regression guard: ConfigEditor must source portfolio-rule metadata from
// /v3/strategy/configs and must not carry a hardcoded local rule catalog.
//
// If these tests fail, someone has reverted the dynamic wiring back to a hardcoded
// rule map (or similar). Fix the component, do not silence these tests.

import { describe, expect, it, vi } from 'vitest';

import type { ConfigEditorFormState } from '@/components/wallet/portfolio/views/invest/configManager/configEditorShared';
import { ConfigEditorStructuredFields } from '@/components/wallet/portfolio/views/invest/configManager/ConfigEditorStructuredFields';

import { render, screen } from '../../../test-utils';

const useStrategyConfigsSpy = vi.hoisted(() => vi.fn());

vi.mock(
  '@/components/wallet/portfolio/views/invest/trading/hooks/useStrategyConfigs',
  () => ({
    useStrategyConfigs: useStrategyConfigsSpy,
  }),
);

const baseFormState: ConfigEditorFormState = {
  configIdInput: '',
  displayName: '',
  description: '',
  strategyId: '',
  primaryAsset: '',
  disabledRules: [],
  supportsDailySuggestion: false,
  paramsJson: '{}',
  compositionJson: '{}',
};

describe('ConfigEditorStructuredFields contract', () => {
  it('subscribes to useStrategyConfigs for portfolio-rule metadata', () => {
    useStrategyConfigsSpy.mockReturnValue({
      data: {
        strategies: [],
        presets: [],
        backtest_defaults: { days: 500, total_capital: 10000 },
        portfolio_rules: [],
      },
      isLoading: false,
      isError: false,
    });

    render(
      <ConfigEditorStructuredFields
        configIdValid
        formState={baseFormState}
        isBenchmark={false}
        mode="create"
        setFormState={vi.fn()}
      />,
    );

    expect(useStrategyConfigsSpy).toHaveBeenCalled();
  });

  it('does not render fallback rule checkboxes when metadata is empty', () => {
    useStrategyConfigsSpy.mockReturnValue({
      data: {
        strategies: [],
        presets: [],
        backtest_defaults: { days: 500, total_capital: 10000 },
        portfolio_rules: [],
      },
      isLoading: false,
      isError: false,
    });

    render(
      <ConfigEditorStructuredFields
        configIdValid
        formState={baseFormState}
        isBenchmark={false}
        mode="create"
        setFormState={vi.fn()}
      />,
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
