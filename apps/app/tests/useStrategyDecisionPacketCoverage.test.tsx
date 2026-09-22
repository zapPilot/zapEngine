// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evidenceChartFromDashboard,
  useStrategyDecisionPacket,
} from '@/integration/useStrategyDecisionPacket';

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  suggestion: vi.fn(),
}));

vi.mock(
  '@zapengine/app-core/hooks/queries/market/useMarketDashboardQuery',
  () => ({
    useMarketDashboardQuery: mocks.dashboard,
  }),
);

vi.mock('@zapengine/app-core/services/suggestion', () => ({
  buildTradeActions: () => [],
  deriveAllocationDiff: () => ({ before: [], after: [] }),
  deriveGuardStates: () => ({}),
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

const dashboard = {
  snapshots: [
    {
      values: {
        eth_btc: { value: 0.04, indicators: { dma_200: { value: 0.038 } } },
      },
    },
    {
      values: { eth_btc: { value: 0.041, indicators: {} } },
    },
  ],
};

describe('strategy decision packet branch coverage', () => {
  it('returns no chart for absent dashboards, series, or insufficient points', () => {
    expect(evidenceChartFromDashboard(undefined, 'eth_btc')).toBeNull();
    expect(evidenceChartFromDashboard(dashboard as never, null)).toBeNull();
    expect(
      evidenceChartFromDashboard(
        {
          snapshots: [{ values: {} }, ...dashboard.snapshots.slice(0, 1)],
        } as never,
        'eth_btc',
      ),
    ).toBeNull();
  });

  it('keeps dashboard querying disabled while no suggestion is available', () => {
    mocks.suggestion.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    mocks.dashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    expect(renderDecisionPacket()).toEqual({
      data: null,
      chart: null,
      isLoading: true,
      isError: false,
    });
    expect(mocks.dashboard).toHaveBeenCalledWith(365, { enabled: false });
  });

  it('combines suggestion and dashboard state when chart evidence is available', () => {
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
      isError: false,
    });
    mocks.dashboard.mockReturnValue({
      data: dashboard,
      isLoading: true,
      isError: true,
    });

    const result = renderDecisionPacket();
    expect(result.data).toMatchObject({
      asOf: '2026-09-16',
      fearGreed: null,
      regime: 'fear',
    });
    expect(result.chart).toEqual({
      values: [0.04, 0.041],
      dma: [0.038, null],
      latestValue: 0.041,
      latestDma: null,
    });
    expect(result.isLoading).toBe(true);
    expect(result.isError).toBe(true);
    expect(mocks.dashboard).toHaveBeenCalledWith(365, { enabled: true });
  });
});
