// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { HomeActionRow } from '@/components/home/HomeActionRow';
import { HomeActionRow as HomeActionRowIos } from '@/components/home/HomeActionRow.ios';

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('lucide-react-native', () => ({
  ArrowDown: () => null,
  ArrowUp: () => null,
  Scale: () => null,
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/home/HomeActionButton', () => ({
  HomeActionButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    t: (key: string) =>
      ({
        'home.invest': 'Invest',
        'home.rebalance': 'Rebalance',
        'home.rebalanceActionRequiredA11y': 'Rebalance action required',
        'home.send': 'Send',
      })[key] ?? key,
  }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('HomeActionRow platform split', () => {
  it('renders Invest, Rebalance, and Send in the shared/web implementation', async () => {
    const rendered = await render(
      createElement(HomeActionRow, { isStrategyActionRequired: false }),
    );

    expect(
      Array.from(rendered.container.querySelectorAll('button')).map(
        (button) => button.textContent,
      ),
    ).toEqual(['Invest', 'Rebalance', 'Send']);

    await rendered.unmount();
  });

  it('renders nothing in the iOS implementation', async () => {
    const rendered = await render(
      createElement(HomeActionRowIos, { isStrategyActionRequired: true }),
    );

    expect(rendered.container.innerHTML).toBe('');

    await rendered.unmount();
  });
});
