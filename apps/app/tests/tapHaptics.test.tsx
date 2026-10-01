// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Tap } from '@/components/ui/Tap';

const runtime = vi.hoisted(() => ({
  os: 'ios',
  impactAsync: vi.fn(async () => {}),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: runtime.impactAsync,
  ImpactFeedbackStyle: { Light: 'Light' },
}));

vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('./support/reactNativeStub');
  const PressableWithPressIn = ({
    children,
    onPressIn,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPressIn?: (event: unknown) => void;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      disabled={disabled}
      onMouseDown={() => onPressIn?.({} as never)}
      onClick={onPress}
    >
      {children}
    </button>
  );
  return {
    ...reactNativeStub,
    Pressable: PressableWithPressIn,
    Platform: {
      get OS() {
        return runtime.os;
      },
      select: (values: { ios?: unknown; default?: unknown }) =>
        values.ios ?? values.default,
    },
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});

async function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host.querySelector('button')!;
}

it('fires a light haptic on native press-in', async () => {
  const button = await mount(<Tap accessibilityLabel="press me" />);
  expect(runtime.os).toBe('ios');
  await act(async () => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  expect(runtime.impactAsync).toHaveBeenCalledOnce();
});

it('skips the haptic when disabled', async () => {
  const button = await mount(<Tap accessibilityLabel="x" disabled />);
  await act(async () => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  expect(runtime.impactAsync).not.toHaveBeenCalled();
});

it('skips the haptic on web', async () => {
  runtime.os = 'web';
  try {
    const button = await mount(<Tap accessibilityLabel="web press" />);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(runtime.impactAsync).not.toHaveBeenCalled();
  } finally {
    runtime.os = 'ios';
  }
});
