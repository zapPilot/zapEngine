// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NetWorthCard } from '@/components/today/NetWorthCard';
import type { useTodayPortfolio } from '@/components/today/useTodayPortfolio';
import { accountFixtures } from './support/accountFixtures';
const m = vi.hoisted(() => ({
  push: vi.fn(),
  open: vi.fn(),
  auth: vi.fn((action: () => void) => action()),
  available: true,
  account: null as ReturnType<typeof accountFixtures.demo> | null,
}));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock(
  'react-native-svg',
  async () => (await import('./support/svgStub')).svgStub,
);
vi.mock('expo-router', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@/integration/useAccount', () => ({ useAccount: () => m.account }));
vi.mock('@/providers/FundFlowProvider', () => ({
  useFundFlow: () => ({
    available: m.available,
    signRequest: null,
    open: m.open,
  }),
}));
vi.mock('@/providers/AuthenticatedActionProvider', () => ({
  useAuthenticatedAction: () => ({ run: m.auth }),
}));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
vi.mock('@/components/ui/Tap', async () => ({
  Tap: (await import('./support/reactNativeStub')).reactNativeStub.Pressable,
}));
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Skeleton', () => ({
  SkeletonBlock: () => <span data-skeleton />,
}));
vi.mock('@/components/charts/PortfolioTrendChart', () => ({
  PortfolioTrendChart: () => <span data-chart />,
}));
vi.mock('@/integration/useHomeData', () => ({
  HOME_RANGE_OPTIONS: ['1D', '1W', '1M', '3M', '1Y'],
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let portfolio: ReturnType<typeof useTodayPortfolio>;
beforeEach(() => {
  vi.clearAllMocks();
  m.available = true;
  portfolio = {
    account: accountFixtures.ownBundle(),
    range: '1M',
    setRange: vi.fn(),
    etl: {
      jobId: null,
      status: 'idle',
      errorMessage: undefined,
      isLoading: false,
      isInProgress: false,
    },
    retryImport: vi.fn(),
    addresses: [],
    result: {
      data: {
        home: {
          totalBalance: 100,
          rangeChangeUsd: 1,
          rangeChangePct: 1,
          trendPoints: [],
          attribution: null,
        },
      },
      isLoading: false,
      isError: false,
      balance: { isLoading: false, isError: false },
      trend: { isLoading: false, isError: false },
      snapshotAvailability: 'available',
    },
  };
  m.account = portfolio.account;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<NetWorthCard portfolio={portfolio} />));
  return host;
}
async function press(label: string) {
  const button = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  )!;
  await act(async () => button.click());
}
it('shows readable demo amounts and routes Fund through authentication', async () => {
  portfolio.account = accountFixtures.demo();
  m.account = portfolio.account;
  await mount();
  expect(host.textContent).toContain('Demo');
  expect(host.textContent).toContain('$100');
  expect(host.querySelector('[data-testid="demo-connect-overlay"]')).toBeNull();
  await press('Fund');
  expect(m.auth).toHaveBeenCalledOnce();
  expect(m.open).toHaveBeenCalledWith({ fresh: true });
  await press('View portfolio');
  expect(m.push).toHaveBeenCalledWith('/portfolio');
});
it('keeps net worth visible while the chart is loading', async () => {
  portfolio.result.trend.isLoading = true;
  await mount();
  expect(host.textContent).toContain('$100');
  expect(host.querySelector('[data-skeleton]')).not.toBeNull();
});
it('makes public bundle funding unavailable without hiding the value', async () => {
  portfolio.account = accountFixtures.bundleView();
  m.account = portfolio.account;
  await mount();
  const button = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === 'Fund',
  )!;
  expect(button.disabled).toBe(true);
  expect(host.textContent).toContain('$100');
  await press('Fund');
  expect(m.open).not.toHaveBeenCalled();
});
it('offers account recovery before showing unresolved balances', async () => {
  portfolio.account = accountFixtures.resolutionFailed();
  m.account = portfolio.account;
  await mount();
  expect(host.textContent).toContain('Account unavailable');
  await press('Retry');
  expect(portfolio.account.retryUserResolution).toHaveBeenCalledOnce();
});
it('keeps a network miss distinct from a missing portfolio', async () => {
  portfolio.result.snapshotAvailability = 'failed';
  portfolio.result.balance.isError = true;
  portfolio.result.data.home.totalBalance = null;
  await mount();
  expect(host.textContent).not.toContain('Preparing');
  expect(portfolio.retryImport).not.toHaveBeenCalled();
});
it.each(['failed', 'completed', 'pending'] as const)(
  'renders the %s portfolio import state',
  async (status) => {
    portfolio.result.snapshotAvailability = 'unavailable';
    portfolio.etl.status = status;
    await mount();
    if (status === 'failed') {
      await press('Retry');
      expect(portfolio.retryImport).toHaveBeenCalledOnce();
    } else expect(host.querySelector('[data-chart]')).toBeNull();
  },
);
it('does not suggest retrying an ownership rejection', async () => {
  portfolio.result.snapshotAvailability = 'unavailable';
  portfolio.etl.status = 'failed';
  portfolio.etl.errorMessage = 'ownership has not been verified';
  await mount();
  expect(host.textContent).toContain('Verify this wallet first');
  expect(
    [...host.querySelectorAll('button')].some((b) => b.textContent === 'Retry'),
  ).toBe(false);
});
it('hides funding whenever the platform provider marks it unavailable', async () => {
  m.available = false;
  await mount();
  expect(
    [...host.querySelectorAll('button')].some((b) => b.textContent === 'Fund'),
  ).toBe(false);
  await press('View portfolio');
  expect(m.push).toHaveBeenCalledWith('/portfolio');
});
