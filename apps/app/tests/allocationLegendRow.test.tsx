// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AllocationLegendRow } from '@/components/charts/AllocationLegendRow';

vi.mock('react-native', () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children, style }: { children?: ReactNode; style?: object }) => (
    <div style={style}>{children}</div>
  ),
}));

vi.mock('@/components/token/TokenIcon', () => ({
  TokenIcon: ({ symbol }: { symbol: string }) => (
    <span data-testid="token-icon" data-symbol={symbol} />
  ),
}));

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

async function render(node: ReactNode) {
  await act(async () => root.render(node));
}

describe('AllocationLegendRow', () => {
  it('uses the token mark for a registered symbol', async () => {
    await render(
      <AllocationLegendRow
        symbol="btc"
        color="#f59e0b"
        label="Bitcoin"
        value={<span>20%</span>}
      />,
    );

    expect(
      container
        .querySelector('[data-testid="token-icon"]')
        ?.getAttribute('data-symbol'),
    ).toBe('BTC');
    expect(container.textContent).toBe('Bitcoin20%');
  });

  it('keeps the color disc fallback for an unknown symbol', async () => {
    await render(
      <AllocationLegendRow
        symbol="DOGE"
        color="#123456"
        label="Other"
        value={<span>5%</span>}
      />,
    );

    expect(container.querySelector('[data-testid="token-icon"]')).toBeNull();
    expect(
      (container.querySelector('[style]') as HTMLElement | null)?.style
        .backgroundColor,
    ).toBe('rgb(18, 52, 86)');
    expect(container.textContent).toBe('Other5%');
  });
});
