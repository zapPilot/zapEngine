// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStrategyDecisionPacket } from '@/integration/useStrategyDecisionPacket';

const mocks = vi.hoisted(() => ({
  suggestion: vi.fn(),
}));

vi.mock('@zapengine/app-core/services/suggestion', () => ({
  buildTradeActions: () => [],
  deriveAllocationDiff: () => ({ before: [], after: [] }),
  deriveGuardStates: () => ({}),
  deriveRuleTrace: () => [],
  deriveTriggerEvidence: () => ({ chartSeriesId: 'eth_btc' }),
  formatRegimeLabel: (value: string) => value,
  getStatusPanelContent: () => ({}),
}));

vi.mock('@/integration/useStrategySuggestion', () => ({
  useStrategySuggestion: mocks.suggestion,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
});

function renderDecisionPacket() {
  let result: ReturnType<typeof useStrategyDecisionPacket> | undefined;
  function Probe() {
    result = useStrategyDecisionPacket('user-1');
    return null;
  }
  act(() => root.render(<Probe />));
  return result!;
}

describe('strategy decision packet hook', () => {
  it('reports loading without a packet while the suggestion is pending', () => {
    mocks.suggestion.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    expect(renderDecisionPacket()).toEqual({
      data: null,
      isLoading: true,
      isError: false,
    });
  });

  it('derives the packet from a settled suggestion and forwards its error state', () => {
    mocks.suggestion.mockReturnValue({
      data: {
        as_of: '2026-09-16',
        action: { status: 'action_required', reason_code: 'ratio' },
        context: {
          signal: { regime: 'fear' },
          market: { sentiment: undefined },
        },
      },
      isLoading: false,
      isError: true,
    });

    const result = renderDecisionPacket();
    expect(result.data).toMatchObject({
      asOf: '2026-09-16',
      fearGreed: null,
      regime: 'fear',
      ruleTrace: [],
      trigger: { chartSeriesId: 'eth_btc' },
    });
    expect(result.isLoading).toBe(false);
    expect(result.isError).toBe(true);
  });
});
