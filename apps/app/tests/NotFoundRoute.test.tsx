// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import NotFoundRoute from '@/app/+not-found';
const replace = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({ useRouter: () => ({ replace }) }));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock('@/components/ui/Tap', async () => ({
  Tap: (await import('./support/reactNativeStub')).reactNativeStub.Pressable,
}));
vi.mock('@/components/ui/ScreenCrashBoundary', () => ({
  ScreenCrashBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/ui/ScreenScrollView', () => ({
  ScreenScrollView: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/ui/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});
it('explains an unknown route and offers a working return to Podcast', async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<NotFoundRoute />));
  expect(host.querySelector('h1')?.textContent).toBe('Page not found');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Podcast"]')!.click(),
  );
  expect(replace).toHaveBeenCalledWith('/podcast');
});
