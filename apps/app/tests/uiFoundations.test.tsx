// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react-native';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/ui/Icon';
import { ReducedMotionProvider } from '@/providers/ReducedMotionProvider';
import { useReducedMotion } from '@/components/ui/useReducedMotion';

const runtime = vi.hoisted(() => ({
  text: vi.fn(),
  glyph: vi.fn(),
  remove: vi.fn(),
  listener: undefined as ((enabled: boolean) => void) | undefined,
  resolve: undefined as ((enabled: boolean) => void) | undefined,
}));
vi.mock('lucide-react-native', () => ({
  ArrowLeft: (props: unknown) => {
    runtime.glyph(props);
    return null;
  },
}));
vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('./support/reactNativeStub');
  return {
    ...reactNativeStub,
    Text: (props: Record<string, unknown> & { children?: ReactNode }) => {
      runtime.text(props);
      return <span>{props.children}</span>;
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: () =>
        new Promise<boolean>((resolve) => {
          runtime.resolve = resolve;
        }),
      addEventListener: (_: string, callback: (enabled: boolean) => void) => {
        runtime.listener = callback;
        return { remove: runtime.remove };
      },
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
}
it('inherits text roles and tones while retaining accessible numeric headings', async () => {
  await mount(
    <Text variant="title" tone="accent" heading={1} numeric>
      <Text>42</Text>
    </Text>,
  );
  const [outer, inner] = runtime.text.mock.calls.map(([props]) => props);
  expect(outer).toMatchObject({
    accessibilityRole: 'header',
    'aria-level': 1,
    maxFontSizeMultiplier: 1.5,
  });
  expect(outer.style).toContainEqual({ fontVariant: ['tabular-nums'] });
  expect(inner.className).toContain('text-title');
  expect(inner.className).toContain('text-accent');
});
it('hides decorative icons and exposes named icons to accessibility', async () => {
  await mount(
    <>
      <Icon icon={ArrowLeft} size="xs" />
      <Icon icon={ArrowLeft} accessibilityLabel="Back" />
    </>,
  );
  expect(runtime.glyph.mock.calls[0]?.[0]).toMatchObject({
    size: 14,
    strokeWidth: 2,
    accessibilityElementsHidden: true,
  });
  expect(runtime.glyph.mock.calls[1]?.[0]).toMatchObject({
    size: 20,
    strokeWidth: 1.75,
    accessibilityLabel: 'Back',
    accessibilityElementsHidden: false,
  });
});
it('keeps a preference change newer than its initial asynchronous read and removes the listener', async () => {
  function Probe() {
    return <span>{String(useReducedMotion())}</span>;
  }
  await mount(
    <ReducedMotionProvider>
      <Probe />
    </ReducedMotionProvider>,
  );
  await act(async () => {
    runtime.listener?.(true);
    runtime.resolve?.(false);
  });
  expect(host?.textContent).toBe('true');
  await act(async () => {
    runtime.listener?.(false);
  });
  expect(host?.textContent).toBe('false');
  await act(async () => root?.unmount());
  root = undefined;
  expect(runtime.remove).toHaveBeenCalledOnce();
});
