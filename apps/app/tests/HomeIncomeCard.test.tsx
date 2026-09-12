// @vitest-environment jsdom

import { act, type CSSProperties, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeIncomeCard } from '@/components/home/HomeIncomeCard';
import type { HomeBorrowingRiskView } from '@/integration/homeBorrowingRiskModel';
import type {
  HomeIncomeView,
  HomeProtocolIncomeRow,
} from '@/integration/homeIncomeModel';

vi.mock('lucide-react-native', () => ({
  ArrowDownRight: () => <span data-icon="arrow-down" />,
  ArrowUpRight: () => <span data-icon="arrow-up" />,
  ChevronDown: () => <span data-icon="chevron-down" />,
  ChevronRight: () => <span data-icon="chevron-right" />,
  Layers: () => <span data-icon="layers" />,
  ShieldAlert: () => <span data-icon="shield-alert" />,
}));
vi.mock('@zapengine/design-tokens/tokens', () => ({
  tokens: { color: { 'ink-faint': '#8a8a8a' } },
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    accessibilityLabel,
    accessibilityState,
    children,
    onPress,
  }: {
    accessibilityLabel?: string;
    accessibilityState?: { expanded?: boolean };
    children?: ReactNode;
    onPress?: () => void;
  }) => (
    <button
      aria-expanded={accessibilityState?.expanded}
      aria-label={accessibilityLabel}
      onClick={onPress}
      type="button"
    >
      {children}
    </button>
  ),
}));
vi.mock('react-native', () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({
    accessibilityLabel,
    children,
    className,
    style,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
  }) => (
    <div aria-label={accessibilityLabel} className={className} style={style}>
      {children}
    </div>
  ),
}));
vi.mock('@/components/token/ProtocolIcon', () => ({
  ProtocolIcon: ({ protocol }: { protocol: string }) => (
    <span data-protocol-icon={protocol} />
  ),
}));
vi.mock('@/components/token/TokenIcon', () => ({
  TokenIcon: ({ symbol }: { symbol: string }) => (
    <span data-token-icon={symbol} />
  ),
}));
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('@/components/ui/SectionLabel', () => ({
  SectionLabel: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('@/components/ui/Skeleton', () => ({
  SkeletonBlock: () => <span data-skeleton />,
}));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}|${Object.values(params).join('|')}` : key,
  }),
}));

function row(
  overrides: Partial<HomeProtocolIncomeRow> & { monthlyNetUsd: number },
): HomeProtocolIncomeRow {
  return {
    protocol: 'Morpho',
    tokenSymbols: [],
    positionTypes: [],
    ...overrides,
  };
}

function view(protocolRows: HomeProtocolIncomeRow[]): HomeIncomeView {
  const incomeMonthlyUsd = protocolRows
    .filter((item) => item.monthlyNetUsd > 0)
    .reduce((total, item) => total + item.monthlyNetUsd, 0);
  const costMonthlyUsd = protocolRows
    .filter((item) => item.monthlyNetUsd < 0)
    .reduce((total, item) => total + item.monthlyNetUsd, 0);

  return {
    status: 'ready',
    passiveMonthlyUsd: incomeMonthlyUsd + costMonthlyUsd,
    incomeMonthlyUsd,
    costMonthlyUsd,
    medianDailyUsd: 1.5,
    windowDays: 30,
    observedDays: 30,
    protocolRows,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(
  income: HomeIncomeView,
  borrowingRisk?: HomeBorrowingRiskView | null,
) {
  await act(async () => {
    root.render(
      <HomeIncomeCard
        income={income}
        borrowingRisk={borrowingRisk ?? null}
        isLoading={false}
        isError={false}
      />,
    );
  });
}

function labels(): string[] {
  return [...container.querySelectorAll('[aria-label]')].map(
    (node) => node.getAttribute('aria-label') ?? '',
  );
}

describe('HomeIncomeCard', () => {
  it('explains a netted headline with labelled gross tiles and a divider', async () => {
    await render(
      view([
        row({ protocol: 'Morpho', chain: 'ethereum', monthlyNetUsd: 60.8 }),
        row({ protocol: 'Aave', chain: 'arbitrum', monthlyNetUsd: -7.6 }),
      ]),
    );

    expect(labels()).toEqual([
      'home.passiveIncomeGrossA11y|$60.80',
      'home.passiveCostGrossA11y|$7.60',
      'Morpho, ethereum, +$60.80',
      'Aave, arbitrum, −$7.60',
    ]);
    expect(container.querySelectorAll('div.h-px')).toHaveLength(1);
  });

  it('drops the gross tiles when the headline has only one side', async () => {
    await render(
      view([row({ protocol: 'Morpho', chain: 'base', monthlyNetUsd: 15.2 })]),
    );

    expect(labels()).toEqual(['Morpho, base, +$15.20']);
    expect(container.textContent).not.toContain('$0.00');
    expect(container.querySelectorAll('div.h-px')).toHaveLength(0);
  });

  it('omits missing chain and token segments from the row label', async () => {
    await render(view([row({ protocol: 'GMX V2', monthlyNetUsd: 91.2 })]));

    expect(labels()).toEqual(['GMX V2, +$91.20']);
  });

  it('caps the token stack at three badges and widens the icon to fit them', async () => {
    await render(
      view([
        row({
          protocol: 'Morpho',
          monthlyNetUsd: 60.8,
          tokenSymbols: ['USDC', 'WETH', 'DAI', 'USDT'],
          positionTypes: ['Lending'],
        }),
      ]),
    );

    expect(
      [...container.querySelectorAll('[data-token-icon]')].map((node) =>
        node.getAttribute('data-token-icon'),
      ),
    ).toEqual(['USDC', 'WETH', 'DAI']);
    expect(
      container.querySelector<HTMLElement>('div.relative.h-11')?.style.width,
    ).toBe('66px');
    expect(labels()).toEqual([
      'Morpho, Lending, USDC / WETH / DAI / USDT, +$60.80',
    ]);
  });

  it('sizes the icon to the protocol mark alone when no tokens are reported', async () => {
    await render(view([row({ protocol: 'Morpho', monthlyNetUsd: 60.8 })]));

    expect(
      container.querySelector<HTMLElement>('div.relative.h-11')?.style.width,
    ).toBe('36px');
  });
});

describe('HomeIncomeCard long tail', () => {
  const longTail = view([
    row({ protocol: 'Morpho', monthlyNetUsd: 100 }),
    row({ protocol: 'Frax', monthlyNetUsd: 40 }),
    row({ protocol: 'Pendle', monthlyNetUsd: 5 }),
    row({ protocol: 'Curve', monthlyNetUsd: 3 }),
    row({ protocol: 'Yearn', monthlyNetUsd: 2 }),
    row({ protocol: 'Aave', monthlyNetUsd: -20 }),
    row({ protocol: 'Spark', monthlyNetUsd: -4 }),
  ]);

  function otherButton(): HTMLButtonElement | null {
    return container.querySelector<HTMLButtonElement>('button[aria-expanded]');
  }

  it('rolls the tail into one collapsed row that names both sides', async () => {
    await render(longTail);

    expect(labels()).toEqual([
      'home.passiveIncomeGrossA11y|$150.00',
      'home.passiveCostGrossA11y|$24.00',
      'Morpho, +$100.00',
      'Frax, +$40.00',
      'Aave, −$20.00',
      'home.incomeOtherA11y|4',
    ]);
    expect(otherButton()?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain(
      'home.incomeOtherIncome|+$10.00 · home.incomeOtherCost|−$4.00',
    );
  });

  it('reveals the rolled-up protocols when the row is opened', async () => {
    await render(longTail);
    await act(async () => {
      otherButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(otherButton()?.getAttribute('aria-expanded')).toBe('true');
    expect(labels()).toEqual([
      'home.passiveIncomeGrossA11y|$150.00',
      'home.passiveCostGrossA11y|$24.00',
      'Morpho, +$100.00',
      'Frax, +$40.00',
      'Aave, −$20.00',
      'home.incomeOtherA11y|4',
      'Pendle, +$5.00',
      'Curve, +$3.00',
      'Yearn, +$2.00',
      'Spark, −$4.00',
    ]);
  });

  it('keeps a single tail row visible instead of hiding it behind a tap', async () => {
    await render(
      view([
        row({ protocol: 'Morpho', monthlyNetUsd: 100 }),
        row({ protocol: 'Frax', monthlyNetUsd: 40 }),
        row({ protocol: 'Pendle', monthlyNetUsd: 5 }),
      ]),
    );

    expect(otherButton()).toBeNull();
    expect(labels()).toEqual([
      'Morpho, +$100.00',
      'Frax, +$40.00',
      'Pendle, +$5.00',
    ]);
  });
});

describe('HomeIncomeCard borrowing risk', () => {
  function borrowingRiskFixture(): HomeBorrowingRiskView {
    return {
      nearestLiquidationBufferPct: 39.577_946_685_920_98,
      worstHealthRate: 1.655,
      totalDebtUsd: 28_472,
      positionCount: 2,
      positions: [
        {
          protocol: 'Morpho',
          chain: 'eth',
          healthRate: 1.655,
          liquidationBufferPct: 39.577_946_685_920_98,
          collateralSymbols: ['WBTC'],
          debtSymbols: ['EURCV'],
          collateralUsd: 17_000,
          debtUsd: 8_472,
        },
        {
          protocol: 'Morpho',
          chain: 'eth',
          healthRate: 1.95,
          liquidationBufferPct: 48.717_948_717_948_72,
          collateralSymbols: ['wstETH'],
          debtSymbols: ['USDT'],
          collateralUsd: 48_800,
          debtUsd: 20_000,
        },
      ],
    };
  }

  function riskButton(): HTMLButtonElement | null {
    return container.querySelector<HTMLButtonElement>('button[aria-expanded]');
  }

  it('renders a collapsed liquidation-risk summary with buffer and a11y label', async () => {
    await render(
      view([row({ protocol: 'Morpho', chain: 'base', monthlyNetUsd: 15.2 })]),
      borrowingRiskFixture(),
    );

    expect(container.textContent).toContain(
      'home.liquidationRiskSummary|2|$28,472.00',
    );
    expect(container.textContent).toContain('−39.6%');
    expect(labels()).toContain('home.liquidationRiskA11y|−39.6%');
    expect(labels()).not.toContain(
      'home.liquidationRiskPositionA11y|Morpho|WBTC|EURCV|−39.6%|1.66',
    );
    expect(container.textContent).not.toContain('home.liquidationRiskScenario');
    expect(riskButton()?.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands to one row per market with HF and scenario copy', async () => {
    await render(
      view([row({ protocol: 'Morpho', chain: 'base', monthlyNetUsd: 15.2 })]),
      borrowingRiskFixture(),
    );
    await act(async () => {
      riskButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(riskButton()?.getAttribute('aria-expanded')).toBe('true');
    expect(labels()).toContain(
      'home.liquidationRiskPositionA11y|Morpho|WBTC|EURCV|−39.6%|1.66',
    );
    expect(labels()).toContain(
      'home.liquidationRiskPositionA11y|Morpho|wstETH|USDT|−48.7%|1.95',
    );
    expect(container.textContent).toContain('HF 1.66');
    expect(container.textContent).toContain('HF 1.95');
    expect(container.textContent).toContain('home.liquidationRiskScenario');
  });

  it('floors at-threshold health factors at 0.0%', async () => {
    await render(
      view([row({ protocol: 'Morpho', chain: 'base', monthlyNetUsd: 15.2 })]),
      {
        nearestLiquidationBufferPct: 0,
        worstHealthRate: 0.9,
        totalDebtUsd: 1_000,
        positionCount: 1,
        positions: [
          {
            protocol: 'Aave',
            chain: 'eth',
            healthRate: 0.9,
            liquidationBufferPct: 0,
            collateralSymbols: ['WETH'],
            debtSymbols: ['USDC'],
            collateralUsd: 900,
            debtUsd: 1_000,
          },
        ],
      },
    );

    expect(container.textContent).toContain('0.0%');
    expect(container.textContent).not.toContain('−0.0%');
    expect(labels()).toContain('home.liquidationRiskA11y|0.0%');
  });
});
