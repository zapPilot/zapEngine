// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FirstRunScreen } from '@/screens/FirstRunScreen';
import { FirstRunScreen as IosFirstRun } from '@/screens/FirstRunScreen.ios';
const state = vi.hoisted(() => ({
  language: 'en',
  connected: false,
  replace: vi.fn(),
}));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: state.replace }),
  Redirect: ({ href }: { href: string }) => <div>{href}</div>,
}));
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => ({ isConnected: state.connected }),
}));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return {
    useContentLanguage: () => ({
      languageCode: state.language,
      setLanguageCode: (code: string) => {
        state.language = code;
      },
      t: en,
    }),
  };
});
vi.mock('@/components/ui/ScreenScrollView', () => ({
  ScreenScrollView: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/components/ui/BrandLockup', () => ({ BrandLockup: () => null }));
vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock('@/components/firstRun/KineticHeadline', () => ({
  KineticHeadline: () => null,
}));
vi.mock('@/components/runtime-model/RuntimeModelStage', () => ({
  RuntimeModelStage: () => null,
}));
vi.mock('@/components/firstRun/FirstRunStatusRows', () => ({
  FirstRunStatusRows: () => null,
}));
vi.mock('@/components/firstRun/FirstRunActions', () => ({
  FirstRunActions: ({ onExplore }: { onExplore: () => void }) => (
    <button onClick={onExplore}>explore</button>
  ),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  state.language = 'en';
  state.connected = false;
  vi.clearAllMocks();
});
it('cycles all three languages and lets an exploring visitor enter Today', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<FirstRunScreen />));
  const language = host.querySelector('button[aria-label="Change language"]')!;
  for (const expected of ['zh-Hant', 'ja', 'en']) {
    await act(async () =>
      language.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(state.language).toBe(expected);
    await act(async () => root.render(<FirstRunScreen />));
  }
  await act(async () =>
    host.querySelector<HTMLButtonElement>('button:not([aria-label])')!.click(),
  );
  expect(state.replace).toHaveBeenCalledWith('/today');
  await act(async () => root.unmount());
});
it('returns a connected user to Today and gives iOS only a Listen redirect', async () => {
  state.connected = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<FirstRunScreen />));
  expect(state.replace).toHaveBeenCalledWith('/today');
  await act(async () => root.render(<IosFirstRun />));
  expect(host.textContent).toBe('/listen');
  expect(host.querySelector('button')).toBeNull();
  await act(async () => root.unmount());
});
