import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDailySuggestion } from '@/components/wallet/portfolio/views/invest/trading/hooks/useDailySuggestion';
import { useDefaultPresetId } from '@/components/wallet/portfolio/views/invest/trading/hooks/useDefaultPresetId';
import { WalletPortfolioPresenter } from '@/components/wallet/portfolio/WalletPortfolioPresenter';
import type { DailySuggestionResponse } from '@/types/strategy';

import { MOCK_DATA } from '../../../../fixtures/mockPortfolioData';

const mocks = vi.hoisted(() => ({
  dashboardView: vi.fn(),
}));

vi.mock('@/lib/routing', () => ({
  useAppRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useAppSearchParams: () => new URLSearchParams(),
  useAppPathname: () => '/bundle',
  buildPathWithSearchParams: (
    pathname: string,
    searchParams: URLSearchParams,
  ) =>
    searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname,
}));

vi.mock('@/providers/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}));

vi.mock('@/components/Footer/Footer', () => ({
  Footer: () => <footer />,
}));

vi.mock('@/components/wallet/portfolio/components/navigation', () => ({
  WalletNavigation: () => <nav />,
}));

vi.mock('@/lib/lazy/lazyImport', () => ({
  lazyImport: () =>
    function LazyStub() {
      return null;
    },
}));

vi.mock('@/components/wallet/portfolio/views/DashboardView', () => ({
  DashboardView: (props: Record<string, unknown>) => {
    mocks.dashboardView(props);
    return (
      <div
        data-testid="dashboard-view"
        data-strategy-target={JSON.stringify(props.strategyTarget)}
        data-strategy-drift={props.strategyDrift as number | undefined}
      />
    );
  },
}));

vi.mock(
  '@/components/wallet/portfolio/views/invest/trading/hooks/useDefaultPresetId',
  () => ({
    useDefaultPresetId: vi.fn(),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/views/invest/trading/hooks/useDailySuggestion',
  () => ({
    useDailySuggestion: vi.fn(),
  }),
);

function createSections() {
  return {
    balance: {
      data: { balance: MOCK_DATA.balance, roiChange7d: 0, roiChange30d: 0 },
      isLoading: false,
      error: null,
    },
    composition: {
      data: {
        currentAllocation: MOCK_DATA.currentAllocation,
        targetAllocation: { crypto: 50, stable: 50 },
        delta: MOCK_DATA.delta,
        positions: 0,
        protocols: 0,
        chains: 0,
      },
      isLoading: false,
      error: null,
    },
    strategy: {
      data: {
        currentRegime: MOCK_DATA.currentRegime,
        sentimentValue: MOCK_DATA.sentimentValue,
        sentimentStatus: MOCK_DATA.sentimentStatus,
        sentimentQuote: MOCK_DATA.sentimentQuote,
        targetAllocation: { crypto: 50, stable: 50 },
        strategyDirection: MOCK_DATA.strategyDirection,
        previousRegime: MOCK_DATA.previousRegime,
        hasSentiment: true,
        hasRegimeHistory: true,
      },
      isLoading: false,
      error: null,
    },
    sentiment: {
      data: {
        value: MOCK_DATA.sentimentValue,
        status: MOCK_DATA.sentimentStatus,
        quote: MOCK_DATA.sentimentQuote,
      },
      isLoading: false,
      error: null,
    },
  };
}

function makeSuggestion(): DailySuggestionResponse {
  return {
    as_of: '2026-05-18',
    config_id: 'preset-1',
    config_display_name: 'Default',
    strategy_id: 'dma_fgi_portfolio_rules',
    action: {
      status: 'no_action',
      required: false,
      kind: null,
      reason_code: 'hold',
      transfers: [],
    },
    context: {
      market: {
        id: '2026-05-18',
        regime: 'Neutral',
        raw_value: 50,
        confidence: 1,
      },
      signal: {
        id: '2026-05-18',
        regime: 'Neutral',
        raw_value: 50,
        confidence: 1,
      },
      portfolio: {
        spot_usd: 600,
        stable_usd: 400,
        total_value: 1000,
        allocation: { spot: 0.6, stable: 0.4 },
        asset_allocation: {
          btc: 0.2,
          eth: 0.15,
          spy: 0.05,
          alt: 0.2,
          stable: 0.4,
        },
      },
      target: {
        allocation: {
          btc: 0.3,
          eth: 0.2,
          spy: 0.1,
          alt: 0,
          stable: 0.4,
        },
      },
      strategy: {
        stance: 'hold',
        reason_code: 'hold',
        rule_group: 'none',
      },
    },
  };
}

const DEFAULT_ETL_STATE = {
  jobId: null,
  status: 'idle' as const,
  errorMessage: undefined,
  isLoading: false,
  isInProgress: false,
};

describe('WalletPortfolioPresenter strategy target', () => {
  afterEach(() => {
    vi.mocked(useDefaultPresetId).mockReset();
    vi.mocked(useDailySuggestion).mockReset();
    mocks.dashboardView.mockReset();
  });

  it('derives Dashboard strategy target and drift from daily suggestion', () => {
    vi.mocked(useDefaultPresetId).mockReturnValue('preset-1');
    vi.mocked(useDailySuggestion).mockReturnValue({
      data: makeSuggestion(),
      error: null,
    } as ReturnType<typeof useDailySuggestion>);

    render(
      <WalletPortfolioPresenter
        data={MOCK_DATA}
        userId="user-1"
        sections={createSections()}
        etlState={DEFAULT_ETL_STATE}
      />,
    );

    expect(useDefaultPresetId).toHaveBeenCalledWith(true);
    expect(useDailySuggestion).toHaveBeenCalledWith('user-1', 'preset-1', true);
    expect(screen.getByTestId('dashboard-view')).toHaveAttribute(
      'data-strategy-target',
      JSON.stringify({
        btc: 30,
        eth: 20,
        spy: 10,
        alt: 0,
        stable: 40,
        crypto: 60,
      }),
    );
    expect(screen.getByTestId('dashboard-view')).toHaveAttribute(
      'data-strategy-drift',
      '0',
    );
  });
});
