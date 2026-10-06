// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseStrategyDataResult } from '@/integration/useStrategyData';
import { StrategyScreen } from '@/screens/StrategyScreen';

const probe = vi.hoisted(() => ({
  strategy: null as UseStrategyDataResult | null,
  strategyCalls: [] as unknown[][],
  sparklineData: [] as number[][],
  push: vi.fn(),
}));

vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: probe.push, setParams: vi.fn() }),
  useLocalSearchParams: () => ({}),
}));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ languageCode: 'en', t: en }) };
});
vi.mock('@/providers/AuthenticatedActionProvider', () => ({
  useAuthenticatedAction: () => ({ run: (action: () => void) => action() }),
}));
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => ({ userId: 'user-1', isConnected: true }),
}));
vi.mock('@/integration/useStrategyData', () => ({
  useStrategyData: (...args: unknown[]) => {
    probe.strategyCalls.push(args);
    return probe.strategy;
  },
}));
vi.mock('@/integration/useStrategyDecisionPacket', () => ({
  useStrategyDecisionPacket: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/integration/useMarketSignals', () => ({
  useMarketSignals: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/components/strategy/DecisionPacketCard', () => ({
  DecisionPacketCard: () => <div data-testid="decision-packet" />,
}));
vi.mock('@/components/strategy/MarketSignalsCard', () => ({
  MarketSignalsCard: () => <div data-testid="market-signals" />,
}));
vi.mock('@/components/charts/Sparkline', () => ({
  Sparkline: (props: { data: number[] }) => {
    probe.sparklineData.push(props.data);
    return <div data-testid="sparkline" />;
  },
}));
vi.mock('@/components/ui/Skeleton', () => ({
  SkeletonBlock: (props: { className?: string }) => (
    <span data-skeleton="true" className={props.className} />
  ),
}));
vi.mock('@/components/ui/ScreenScrollView', () => ({
  ScreenScrollView: (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  ),
}));
vi.mock('@/components/ui/PageHeader', () => ({
  PageHeader: (props: { title: string }) => <h1>{props.title}</h1>,
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: (props: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props.accessibilityLabel}
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
}));

const CHART_SKELETON = '[data-skeleton][class="h-[138px] w-full rounded-2xl"]';
const UNAVAILABLE = 'Backtest unavailable right now.';
const DISCLAIMER =
  "Hypothetical backtest. It assumes a yield on stablecoin and crypto balances and includes an S&P 500 sleeve that can't be executed yet. Past performance does not guarantee future results.";

function strategyResult(
  options: {
    isLoading?: boolean;
    isError?: boolean;
    chartData?: number[];
    displayName?: string | null;
  } = {},
): UseStrategyDataResult {
  return {
    isLoading: options.isLoading ?? false,
    isError: options.isError ?? false,
    data: {
      backtest: {
        returnLabel: '—',
        vsBtcLabel: 'Trades —',
        vsEthLabel: 'Max DD —',
        metrics: [],
        currentModeLabel: '—',
        allocation: [],
        chartData: options.chartData ?? [],
        displayName: options.displayName ?? null,
      },
      hasTargetAllocation: false,
    },
  };
}

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function renderStrategy(result: UseStrategyDataResult) {
  probe.strategy = result;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<StrategyScreen />));
  return host;
}

beforeEach(() => {
  probe.strategy = null;
  probe.strategyCalls = [];
  probe.sparklineData = [];
  probe.push.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe('StrategyScreen', () => {
  it('shows the chart skeleton while the backtest loads', async () => {
    const container = await renderStrategy(strategyResult({ isLoading: true }));

    expect(container.querySelector(CHART_SKELETON)).not.toBeNull();
    expect(container.querySelector('[data-testid="sparkline"]')).toBeNull();
    expect(container.textContent).not.toContain(UNAVAILABLE);
    // Signed-in only: the decision packet renders without a demo branch.
    expect(
      container.querySelector('[data-testid="decision-packet"]'),
    ).not.toBeNull();
    // The default 1Y range asks for a 365-day backtest; no connection flag.
    expect(probe.strategyCalls.at(-1)).toEqual(['user-1', 365]);
  });

  it('says the backtest is unavailable when it failed', async () => {
    const container = await renderStrategy(strategyResult({ isError: true }));

    expect(container.textContent).toContain(UNAVAILABLE);
    expect(container.querySelector('[data-testid="sparkline"]')).toBeNull();
    expect(container.querySelector(CHART_SKELETON)).toBeNull();
    expect(probe.sparklineData).toEqual([]);
  });

  it('says the backtest is unavailable rather than charting a single point', async () => {
    const container = await renderStrategy(
      strategyResult({ chartData: [10_000] }),
    );

    expect(container.textContent).toContain(UNAVAILABLE);
    expect(container.querySelector('[data-testid="sparkline"]')).toBeNull();
  });

  it('charts the live backtest under the reference strategy subtitle and disclaimer', async () => {
    const livePoints = [10_000, 10_420, 10_910];
    const container = await renderStrategy(
      strategyResult({
        chartData: livePoints,
        displayName: 'DMA/FGI Portfolio Rules',
      }),
    );
    const text = container.textContent!;

    expect(text).toContain(
      'Reference strategy: DMA/FGI Portfolio Rules. Evaluated daily. Advisory only — nothing executes automatically.',
    );
    expect(text).toContain('Reference strategy · backtest ROI');
    expect(text).toContain(DISCLAIMER);
    expect(text).not.toContain(UNAVAILABLE);
    expect(probe.sparklineData.at(-1)).toEqual(livePoints);
    expect(text).toContain('Invest with your own mix');
  });

  it('omits the subtitle when the backtest has no display name', async () => {
    const container = await renderStrategy(
      strategyResult({ chartData: [1, 2] }),
    );

    expect(container.textContent).not.toContain('Reference strategy:');
    expect(container.textContent).toContain(DISCLAIMER);
  });
});
