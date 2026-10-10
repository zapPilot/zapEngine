// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RuntimeScreen } from '@/screens/RuntimeScreen';
const state = vi.hoisted(() => ({ section: 'wallet', scroll: vi.fn() }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ section: state.section }),
}));
vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('./support/reactNativeStub');
  return {
    ...reactNativeStub,
    View: ({
      children,
      onLayout,
    }: {
      children?: ReactNode;
      onLayout?: (event: unknown) => void;
    }) => (
      <div>
        {children}
        {onLayout ? (
          <button
            onClick={() => onLayout({ nativeEvent: { layout: { y: 120 } } })}
          >
            layout
          </button>
        ) : null}
      </div>
    ),
  };
});
vi.mock('@/components/ui/ScreenScrollView', () => ({
  ScreenScrollView: ({
    children,
    scrollRef,
  }: {
    children: ReactNode;
    scrollRef: { current: unknown };
  }) => {
    scrollRef.current = { scrollTo: state.scroll };
    return <div>{children}</div>;
  },
}));
vi.mock('@/components/ui/PageHeader', () => ({
  PageHeader: () => <h1>Runtime</h1>,
}));
vi.mock('@/components/today/WalletChip', () => ({ WalletChip: () => null }));
vi.mock('@/components/runtime-model/RuntimeModelStage', () => ({
  RuntimeModelStage: () => null,
}));
vi.mock('@/components/runtime/RuntimePartsMeter', () => ({
  RuntimePartsMeter: () => null,
}));
vi.mock('@/components/runtime/RuntimeStrategySection', () => ({
  RuntimeStrategySection: () => <div>strategy</div>,
}));
vi.mock('@/components/runtime/RuntimeMachineSection', () => ({
  RuntimeMachineSection: () => <div>machine</div>,
}));
vi.mock('@/components/runtime/RuntimeWalletSection', () => ({
  RuntimeWalletSection: () => <div>wallet</div>,
}));
vi.mock('@/components/runtime/RuntimeYouSection', () => ({
  RuntimeYouSection: () => <div>you</div>,
}));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it('renders every public section and resolves the wallet deep link after layout', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<RuntimeScreen />));
  for (const text of ['strategy', 'machine', 'wallet', 'you'])
    expect(host.textContent).toContain(text);
  expect(state.scroll).not.toHaveBeenCalled();
  await act(async () => {
    for (const button of host.querySelectorAll('button')) button.click();
  });
  expect(state.scroll).toHaveBeenLastCalledWith({ y: 240, animated: false });
  state.section = 'other';
  state.scroll.mockClear();
  await act(async () => root.render(<RuntimeScreen />));
  expect(state.scroll).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});
