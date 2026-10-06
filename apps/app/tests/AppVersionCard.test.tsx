// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { AppUpdateView } from '@/integration/appUpdate';
import { en } from '@/i18n/modules/account';
import { AppVersionCard } from '@/components/account/AppVersionCard';
const mock = vi.hoisted(() => ({
  view: { status: 'version-only', currentVersion: '0.2.0' } as AppUpdateView,
  update: vi.fn(),
  install: vi.fn(),
  retry: vi.fn(),
}));
vi.mock('@/hooks/useAppUpdate', () => ({ useAppUpdate: () => mock }));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    t: (key: string) => en[key as keyof typeof en],
  }),
}));
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Text', () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress: () => void;
  }) => <button onClick={onPress}>{children}</button>,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it('shows the native desktop version and routes each explicit update action', async () => {
  const host = document.createElement('div'),
    root = createRoot(host);
  try {
    await act(async () => root.render(createElement(AppVersionCard)));
    expect(host.textContent).toContain('Version 0.2.0');
    expect(host.textContent).not.toContain('3.0.1');
    for (const [view, action, label] of [
      [
        {
          status: 'available',
          currentVersion: '0.2.0',
          latestVersion: '0.2.1',
        },
        mock.update,
        'Update',
      ],
      [
        { status: 'ready', currentVersion: '0.2.0' },
        mock.install,
        'Restart and Update',
      ],
      [{ status: 'error', currentVersion: '0.2.0' }, mock.retry, 'Retry'],
    ] as const) {
      mock.view = view;
      await act(async () => root.render(createElement(AppVersionCard)));
      const button = host.querySelector('button')!;
      expect(button.textContent).toBe(label);
      await act(async () => button.click());
      expect(action).toHaveBeenCalledOnce();
    }
    mock.view = { status: 'downloading', currentVersion: '0.2.0', percent: 42 };
    await act(async () => root.render(createElement(AppVersionCard)));
    expect(host.textContent).toContain('Downloading 42%');
    expect(host.querySelector('button')).toBeNull();
    mock.view = { status: 'move-to-applications', currentVersion: '0.2.0' };
    await act(async () => root.render(createElement(AppVersionCard)));
    expect(host.textContent).toContain('Applications');
    mock.view = { status: 'hidden' };
    await act(async () => root.render(createElement(AppVersionCard)));
    expect(host.textContent).toBe('');
  } finally {
    await act(async () => root.unmount());
  }
});
