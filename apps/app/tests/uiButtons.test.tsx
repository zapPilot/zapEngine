// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ArrowLeft } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    disabled,
    onPress,
    accessibilityLabel,
    accessibilityState,
    className,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityState?: { busy?: boolean };
    className?: string;
  }) => (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={onPress}
      aria-label={accessibilityLabel}
      aria-busy={accessibilityState?.busy}
    >
      {children}
    </button>
  ),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});
async function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host.querySelector('button')!;
}
it('exposes its label and triggers one action', async () => {
  const onPress = vi.fn();
  const button = await mount(<Button onPress={onPress}>Continue</Button>);
  expect(button.textContent).toBe('Continue');
  await act(async () => button.click());
  expect(onPress).toHaveBeenCalledOnce();
});
it('retains its label and layout while blocking repeated actions during loading', async () => {
  const onPress = vi.fn();
  const button = await mount(
    <Button onPress={onPress} loading>
      Continue
    </Button>,
  );
  expect(button.textContent).toBe('Continue');
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(button.disabled).toBe(true);
  expect(button.querySelector('.opacity-0')).not.toBeNull();
  await act(async () => button.click());
  expect(onPress).not.toHaveBeenCalled();
});
it('keeps a small icon control within a 44px labelled hit target', async () => {
  const button = await mount(
    <IconButton icon={ArrowLeft} size="sm" accessibilityLabel="Back" />,
  );
  expect(button.getAttribute('aria-label')).toBe('Back');
  expect(button.classList.contains('min-h-hit')).toBe(true);
  expect(button.classList.contains('min-w-hit')).toBe(true);
  expect(button.querySelector('.h-control-sm')).not.toBeNull();
});
