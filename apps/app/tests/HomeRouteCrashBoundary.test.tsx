// @vitest-environment jsdom
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HomeRoute from '@/app/(tabs)/home';

const mocks = vi.hoisted(() => ({
  onCapturedError: vi.fn(),
  homeScreenRendered: vi.fn(),
  platform: { OS: 'web' as 'web' | 'ios' },
  crash: { enabled: false },
}));

// The stand-in is reached through `await import(...)` rather than a top-level
// import: vi.mock factories are hoisted above imports, so an outer import
// binding referenced from inside one hits a TDZ error.
vi.mock('@sentry/react-native', async () => {
  const { createSentryErrorBoundaryStandIn } =
    await import('./support/sentryErrorBoundaryStandIn');

  return {
    ErrorBoundary: createSentryErrorBoundaryStandIn(mocks.onCapturedError),
  };
});

vi.mock('react-native', () => ({
  Platform: mocks.platform,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

// FinancialFeatureRoute itself stays real — the boundary's position relative to
// its iOS lock-screen short circuit is what these tests are about — so only its
// leaf UI dependencies are stubbed.
vi.mock('lucide-react-native', () => ({ LockKeyhole: () => null }));
vi.mock('@/components/OpenZapPilotWebButton', () => ({
  OpenZapPilotWebButton: () => null,
}));
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/ui/ScreenScrollView', () => ({
  ScreenScrollView: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
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

vi.mock('@/screens/HomeScreen', () => ({
  HomeScreen: () => {
    mocks.homeScreenRendered();
    if (mocks.crash.enabled) {
      throw new Error('home derivation boom');
    }
    return <div>home screen</div>;
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Stands in for the tab shell: a sibling that must outlive a Home crash. */
function AppShellStandIn(): ReactElement {
  return (
    <div>
      <HomeRoute />
      <nav>Tab bar</nav>
    </div>
  );
}

async function mount(
  node: ReactNode,
): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  return { container, root };
}

async function unmount({
  container,
  root,
}: {
  container: HTMLDivElement;
  root: Root;
}): Promise<void> {
  await act(async () => {
    root.unmount();
  });
  container.remove();
}

describe('Home route crash boundary', () => {
  beforeEach(() => {
    mocks.platform.OS = 'web';
    mocks.crash.enabled = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('leaves the rendered Home output untouched when nothing throws', async () => {
    const mounted = await mount(<HomeRoute />);

    expect(mounted.container.innerHTML).toBe('<div>home screen</div>');
    expect(mocks.onCapturedError).not.toHaveBeenCalled();

    await unmount(mounted);
  });

  it('contains a Home render crash instead of taking the surrounding tree down with it', async () => {
    mocks.crash.enabled = true;

    const mounted = await mount(<AppShellStandIn />);

    expect(mounted.container.textContent).toContain('Something went wrong');
    expect(mounted.container.textContent).toContain('Try again');
    // The whole point of the screen boundary: siblings stay mounted.
    expect(mounted.container.textContent).toContain('Tab bar');

    await unmount(mounted);
  });

  it('reports the crash to Sentry tagged with the screen', async () => {
    mocks.crash.enabled = true;

    const mounted = await mount(<AppShellStandIn />);

    expect(mocks.onCapturedError).toHaveBeenCalledOnce();
    expect(mocks.onCapturedError).toHaveBeenCalledWith({
      error: expect.objectContaining({ message: 'home derivation boom' }),
      tags: { screen: 'home' },
    });

    await unmount(mounted);
  });

  it('never mounts the boundary on the iOS lock-screen path', async () => {
    mocks.platform.OS = 'ios';
    mocks.crash.enabled = true;

    const mounted = await mount(<AppShellStandIn />);

    expect(mounted.container.textContent).toContain(
      'Available on Zap Pilot Web',
    );
    expect(mocks.homeScreenRendered).not.toHaveBeenCalled();
    expect(mocks.onCapturedError).not.toHaveBeenCalled();

    await unmount(mounted);
  });
});
