// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { TextField } from '@/components/ui/TextField';
vi.mock('nativewind', () => ({ cssInterop: vi.fn() }));

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
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});
async function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}
it('does not display a hidden sheet and dismisses a visible sheet using its labelled close control', async () => {
  const close = vi.fn();
  const props = {
    title: 'Choose wallet',
    closeLabel: 'Close wallet picker',
    onClose: close,
  };
  const page = await mount(
    <Sheet {...props} visible={false}>
      Wallet choices
    </Sheet>,
  );
  expect(page.querySelector('[role="dialog"]')).toBeNull();
  await act(async () =>
    root!.render(
      <Sheet {...props} visible>
        Wallet choices
      </Sheet>,
    ),
  );
  expect(page.textContent).toContain('Wallet choices');
  await act(async () =>
    page
      .querySelector<HTMLButtonElement>('[aria-label="Close wallet picker"]')!
      .click(),
  );
  expect(close).toHaveBeenCalledOnce();
});
it('blocks dismissal and repeat confirmations while the destructive operation is busy', async () => {
  const close = vi.fn();
  const confirm = vi.fn();
  const page = await mount(
    <ConfirmSheet
      visible
      title="Delete account"
      closeLabel="Close"
      cancelLabel="Cancel"
      confirmLabel="Delete"
      body="This cannot be undone"
      busy
      destructive
      onClose={close}
      onConfirm={confirm}
    />,
  );
  for (const button of page.querySelectorAll('button')) {
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
  }
  expect(close).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});
it('closes the action sheet before running the selected action', async () => {
  const calls: string[] = [];
  const page = await mount(
    <ActionSheet
      visible
      title="Wallet actions"
      closeLabel="Close"
      onClose={() => calls.push('close')}
      actions={[
        {
          id: 'copy',
          label: 'Copy address',
          onPress: () => calls.push('copy'),
        },
      ]}
    />,
  );
  await act(async () =>
    page
      .querySelector<HTMLButtonElement>('[aria-label="Copy address"]')!
      .click(),
  );
  expect(calls).toEqual(['close', 'copy']);
});
it('names its input and exposes validation errors as alerts', async () => {
  const page = await mount(
    <TextField
      label="Wallet address"
      value="invalid"
      error="Enter a valid address"
    />,
  );
  expect(page.querySelector('input')?.getAttribute('aria-label')).toBe(
    'Wallet address',
  );
  expect(page.querySelector('[role="alert"]')?.textContent).toBe(
    'Enter a valid address',
  );
});
