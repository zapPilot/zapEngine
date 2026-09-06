// @vitest-environment jsdom

import {
  act,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useLayoutEffect,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PortfolioTrendChart } from '@/components/charts/PortfolioTrendChart';
import type { DailyValuePoint } from '@/integration/portfolioMetrics';

interface MockViewProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  testID?: string;
  pointerEvents?: string;
  onLayout?: (event: {
    nativeEvent: { layout: { width: number; height: number } };
  }) => void;
}

vi.mock('react-native', () => ({
  Text: ({ children, ...props }: HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
  View: ({
    children,
    testID,
    pointerEvents: _pointerEvents,
    onLayout,
    ...props
  }: MockViewProps) => {
    useLayoutEffect(() => {
      onLayout?.({ nativeEvent: { layout: { width: 200, height: 100 } } });
    }, [onLayout]);
    return (
      <div {...props} data-testid={testID}>
        {children}
      </div>
    );
  },
}));

vi.mock('@/components/charts/Sparkline', () => ({
  Sparkline: () => <div data-testid="sparkline" />,
}));

// Drives the real English dictionary rather than a parallel fake one, so a
// missing key or a dropped `{name}` placeholder fails here.
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('@/i18n/translations');
  return {
    useContentLanguage: () => ({
      languageCode: 'en',
      t: (key: keyof typeof en, params?: Record<string, string | number>) =>
        en[key].replace(/\{([^}]+)\}/g, (match, name: string) =>
          params?.[name] === undefined ? match : String(params[name]),
        ),
    }),
  };
});

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

function pointerEvent(
  type: string,
  pointerType: 'mouse' | 'touch',
  offsetX: number,
): Event {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    offsetX: { value: offsetX },
  });
  return event;
}

const DEFAULT_ATTRIBUTION: NonNullable<DailyValuePoint['attribution']> = [
  { kind: 'market', label: 'ETH', valueUsd: 20 },
  { kind: 'protocol', label: 'Aave', valueUsd: 4 },
  { kind: 'flow', label: 'USDC', valueUsd: 2 },
  { kind: 'residual', valueUsd: -1 },
];

async function renderChart(
  attribution: NonNullable<
    DailyValuePoint['attribution']
  > = DEFAULT_ATTRIBUTION,
) {
  await act(async () => {
    root.render(
      <PortfolioTrendChart
        trendPoints={[
          { date: '2026-08-20', total_value_usd: 100 },
          {
            date: '2026-08-21',
            total_value_usd: 125,
            categories: [{ assets_usd: 150, debt_usd: 25 }],
            attribution,
          },
          { date: '2026-08-22', total_value_usd: 120 },
        ]}
        height={100}
      />,
    );
  });
  return container.querySelector<HTMLElement>(
    '[data-testid="portfolio-trend-chart"]',
  );
}

describe('PortfolioTrendChart interactions', () => {
  it('shows the nearest point with sorted attribution and closes when the pointer leaves', async () => {
    const chart = await renderChart();
    await act(async () =>
      chart?.dispatchEvent(pointerEvent('pointermove', 'mouse', 100)),
    );

    expect(container.textContent).toContain('Net change: +$25.00');
    expect(container.textContent).toContain('ETH price+$20.00');
    // A balance change the backend did not flag is presented as a return; a
    // flagged one and every wallet transfer stay neutral "flow" copy.
    expect(container.textContent).toContain('Aave returns+$4.00');
    expect(container.textContent).toContain('USDC flow+$2.00');
    expect(container.textContent).toContain('Other−$1.00');
    expect(container.textContent).toContain('Assets: $150.00');
    expect(container.textContent).toContain('Debt: $25.00');
    expect(
      container.querySelectorAll(
        '[data-testid="portfolio-trend-attribution-row"]',
      ),
    ).toHaveLength(4);

    await act(async () =>
      chart?.dispatchEvent(pointerEvent('pointerout', 'mouse', 100)),
    );
    expect(
      container.querySelector('[data-testid="portfolio-trend-tooltip"]'),
    ).toBeNull();
  });

  it('says how many attribution rows it dropped instead of truncating silently', async () => {
    const chart = await renderChart([
      ...Array.from({ length: 7 }, (_unused, index) => ({
        kind: 'market' as const,
        label: `TOKEN${index}`,
        valueUsd: 10 - index,
      })),
      { kind: 'residual' as const, valueUsd: 1 },
    ]);
    await act(async () =>
      chart?.dispatchEvent(pointerEvent('pointermove', 'mouse', 100)),
    );

    expect(
      container.querySelectorAll(
        '[data-testid="portfolio-trend-attribution-row"]',
      ),
    ).toHaveLength(6);
    expect(container.textContent).toContain('+2 more');
  });

  it('tracks a pressed touch drag, closes on release, and clamps the marker', async () => {
    const chart = await renderChart();
    await act(async () =>
      chart?.dispatchEvent(pointerEvent('pointerdown', 'touch', -50)),
    );
    const marker = container.querySelector<HTMLElement>(
      '[data-testid="portfolio-trend-marker"]',
    );
    expect((marker?.style as CSSProperties).left).toBe('0px');
    expect(container.textContent).not.toContain('Net change:');

    await act(async () =>
      chart?.dispatchEvent(pointerEvent('pointermove', 'touch', 500)),
    );
    expect(Number.parseFloat(marker?.style.left ?? '')).toBeLessThanOrEqual(
      192,
    );

    await act(async () =>
      chart?.dispatchEvent(pointerEvent('pointerup', 'touch', 500)),
    );
    expect(
      container.querySelector('[data-testid="portfolio-trend-tooltip"]'),
    ).toBeNull();
  });
});
