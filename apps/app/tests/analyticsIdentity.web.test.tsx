// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsIdentitySync } from '@/integration/analyticsIdentity.web';

const mocks = vi.hoisted(() => ({
  account: { userId: null as string | null, isNewUser: false },
  identify: vi.fn(),
  reset: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocks.account,
}));
vi.mock('@/observability/analytics', () => ({
  identifyAnalyticsUser: mocks.identify,
  resetAnalyticsUser: mocks.reset,
  trackEvent: mocks.track,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(): Promise<void> {
  if (!root) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root?.render(createElement(AnalyticsIdentitySync));
  });
}

beforeEach(() => {
  mocks.account.userId = null;
  mocks.account.isNewUser = false;
  vi.clearAllMocks();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('AnalyticsIdentitySync web', () => {
  it('identifies each new backend user once and records the acquisition flag', async () => {
    mocks.account.userId = 'user-1';
    mocks.account.isNewUser = true;
    await render();

    expect(mocks.identify).toHaveBeenCalledWith('user-1');
    expect(mocks.track).toHaveBeenCalledWith('wallet_connected', {
      is_new_user: true,
    });

    mocks.account.isNewUser = false;
    await render();
    expect(mocks.identify).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledOnce();

    mocks.account.userId = 'user-2';
    await render();
    expect(mocks.identify).toHaveBeenLastCalledWith('user-2');
    expect(mocks.track).toHaveBeenLastCalledWith('wallet_connected', {
      is_new_user: false,
    });
  });

  it('resets analytics when an identified account disconnects', async () => {
    mocks.account.userId = 'user-1';
    await render();

    mocks.account.userId = null;
    await render();

    expect(mocks.reset).toHaveBeenCalledOnce();
    await render();
    expect(mocks.reset).toHaveBeenCalledOnce();
  });

  it('does not reset an anonymous session before any identity was joined', async () => {
    await render();
    expect(mocks.identify).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
