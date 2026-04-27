// Regression guard: ConfigEditor must source strategies from /v3/strategy/configs,
// not a hardcoded list. See plan declarative-jingling-cake.md.
//
// If this test fails, someone has reverted the dynamic wiring back to a hardcoded
// STRATEGY_IDS map (or similar). Fix the component, do not silence this test.

import { describe, expect, it, vi } from 'vitest';

import type { ConfigEditorFormState } from '@/components/wallet/portfolio/views/invest/configManager/configEditorShared';
import { ConfigEditorStructuredFields } from '@/components/wallet/portfolio/views/invest/configManager/ConfigEditorStructuredFields';

import { render } from '../../../test-utils';

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
  supportsDailySuggestion: false,
  paramsJson: '{}',
  compositionJson: '{}',
};

describe('ConfigEditorStructuredFields contract', () => {
  it('subscribes to useStrategyConfigs (deletion guard)', () => {
    useStrategyConfigsSpy.mockReturnValue({
      data: {
        strategies: [],
        presets: [],
        backtest_defaults: { days: 500, total_capital: 10000 },
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
});
