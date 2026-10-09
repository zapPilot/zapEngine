// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SignBar } from '@/components/fund/SignBar';
const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/providers/FundFlowProvider', () => ({
  useFundFlow: () => ({
    available: true,
    signRequest: { kind: 'review', amountUsd: 100, expiresAt: 2000 },
    open: mocks.open,
  }),
}));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    onPress,
  }: {
    children?: ReactNode;
    onPress: () => void;
  }) => <button onClick={onPress}>{children}</button>,
}));
vi.mock('@/components/ui/StatusGlyph', () => ({ StatusGlyph: () => null }));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('changes checked to re-check at expiry with one timer and reopens the retained flow', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(1000));
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<SignBar />));
  expect(host.textContent).toContain('Checked');
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(host.textContent).toContain('Re-check');
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => host.querySelector('button')!.click());
  expect(mocks.open).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  host.remove();
});
