// @vitest-environment jsdom
import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppProviderShell } from '@/providers/AppProviderShell';

const mocks = vi.hoisted(() => ({
  onCapturedError: vi.fn(),
}));

// A minimal stand-in for @sentry/react-native's `ErrorBoundary` (itself
// re-exported from @sentry/react): catches render errors from its subtree,
// records that one was captured, and renders `fallback` instead of crashing.
// `react` is imported dynamically here rather than referencing this file's
// top-level import — vi.mock factories are hoisted above imports, and
// referencing an outer import binding from inside one hits a TDZ error.
vi.mock('@sentry/react-native', async () => {
  const { Component } = await import('react');

  class ErrorBoundary extends Component<
    {
      children?: ReactNode;
      fallback?: (props: {
        error: unknown;
        resetError: () => void;
      }) => ReactNode;
    },
    { error: unknown }
  > {
    state: { error: unknown } = { error: null };

    static getDerivedStateFromError(error: unknown) {
      return { error };
    }

    override componentDidCatch(error: unknown) {
      mocks.onCapturedError(error);
    }

    resetError = () => this.setState({ error: null });

    override render() {
      if (this.state.error) {
        return this.props.fallback?.({
          error: this.state.error,
          resetError: this.resetError,
        });
      }
      return this.props.children;
    }
  }

  return { ErrorBoundary };
});

vi.mock('expo-font', () => ({ useFonts: () => [true] }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('@/lib/fonts', () => ({ APP_FONTS: {} }));

vi.mock('@/config/expoRuntimeConfig', () => ({
  getExpoMobileRuntimeConfig: () => ({
    runtime: 'test',
    privy: { appId: 'app-id', clientId: 'client-id' },
  }),
}));

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
  Platform: { OS: 'web' },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/connect/ConnectSheetHost', () => ({
  ConnectSheetHost: () => null,
}));
vi.mock('@/components/podcast/PodcastProgressTracker', () => ({
  PodcastProgressTracker: () => null,
}));
vi.mock('@/components/ui/ZapLogo', () => ({ ZapLogo: () => null }));
vi.mock('@/components/ui/PrimaryButton', () => ({
  PrimaryButton: ({
    children,
    onPress,
  }: {
    children?: ReactNode;
    onPress?: () => void;
  }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));

const { passthrough } = vi.hoisted(() => ({
  passthrough: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('@/providers/AuthenticatedActionProvider', () => ({
  AuthenticatedActionProvider: passthrough,
}));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  ContentLanguageProvider: passthrough,
}));
vi.mock('@/providers/PodcastPlayerProvider', () => ({
  PodcastPlayerProvider: passthrough,
}));
vi.mock('@/providers/VideoPlaybackCoordinatorProvider', () => ({
  VideoPlaybackCoordinatorProvider: passthrough,
}));
vi.mock('@/providers/PodcastProgressProvider', () => ({
  PodcastProgressProvider: passthrough,
}));
vi.mock('@/providers/ToastProvider', () => ({ ToastProvider: passthrough }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): null {
  throw new Error('render boom');
}

async function mount(children: ReactNode): Promise<{
  container: HTMLDivElement;
  root: Root;
}> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <AppProviderShell
        requiresMobilePrivy
        missingConfigTarget="test flow"
        renderWalletProviders={(content: ReactNode) => content as ReactElement}
      >
        {children}
      </AppProviderShell>,
    );
  });
  return { container, root };
}

describe('AppProviderShell error boundary', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders children normally when nothing throws', async () => {
    const { container, root } = await mount(createElement('p', null, 'ok'));

    expect(container.textContent).toContain('ok');
    expect(mocks.onCapturedError).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('catches a render crash from deep in the tree and shows the fallback instead of a white screen', async () => {
    const { container, root } = await mount(createElement(Boom));

    expect(mocks.onCapturedError).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('Try again');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
