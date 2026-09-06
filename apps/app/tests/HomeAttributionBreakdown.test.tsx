// @vitest-environment jsdom

import { act, type CSSProperties, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeAttributionBreakdown } from '@/components/home/HomeAttributionBreakdown';
import type { RangeAttributionSummary } from '@/integration/rangeAttribution';

vi.mock('lucide-react-native', () => ({
  ArrowDownRight: () => <span data-icon="arrow-down" />,
  ArrowLeftRight: () => <span data-icon="arrow-left-right" />,
  ArrowUpRight: () => <span data-icon="arrow-up" />,
  Coins: () => <span data-icon="coins" />,
  TrendingUp: () => <span data-icon="trending-up" />,
}));
vi.mock('@zapengine/design-tokens/tokens', () => ({
  tokens: {
    color: { 'ink-faint': '#8a8a8a', success: '#7fbf7f', error: '#ef9292' },
  },
}));
vi.mock('react-native', () => ({
  Text: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
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
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({ t: (key: string) => key }),
}));

const summary = (
  overrides: Partial<RangeAttributionSummary> = {},
): RangeAttributionSummary => ({
  netChangeUsd: 43_184,
  marketUsd: 39_820,
  protocolUsd: 2_910,
  flowUsd: 300,
  otherUsd: 154,
  gainsUsd: 67_420,
  lossesUsd: -24_236,
  attributedDays: 300,
  totalDays: 365,
  ...overrides,
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

async function render(value: RangeAttributionSummary | null) {
  await act(async () => {
    root.render(<HomeAttributionBreakdown summary={value} />);
  });
}

function labels(): string[] {
  return [...container.querySelectorAll('[aria-label]')].map(
    (node) => node.getAttribute('aria-label') ?? '',
  );
}

describe('HomeAttributionBreakdown', () => {
  it('names each bucket and its amount for screen readers', async () => {
    await render(summary());

    expect(labels()).toEqual([
      '+$67,420 home.attribution.gains',
      '−$24,236 home.attribution.losses',
      'home.attribution.price, +$39,820',
      'home.attribution.protocol, +$2,910',
      // Flows and the unexplained remainder read as one line: neither is money
      // the app can claim the user earned.
      'home.attribution.flows, +$454',
    ]);
    expect(container.textContent).toContain('home.attribution.basis');
  });

  it('marks a negative bucket with the error colour', async () => {
    await render(summary({ marketUsd: -1_200 }));

    const negative = [...container.querySelectorAll('span.text-error')].map(
      (node) => node.textContent,
    );
    expect(negative).toContain('−$1,200');
  });

  it('stays hidden when too few days could be explained', async () => {
    await render(summary({ attributedDays: 100, totalDays: 365 }));

    expect(container.textContent).toBe('');
  });

  it('renders nothing without a summary', async () => {
    await render(null);

    expect(container.textContent).toBe('');
  });
});
