// @vitest-environment jsdom

import { act, type ReactElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConnectOutcome } from '@/integration/useAccount';
import {
  AuthenticatedActionProvider,
  useAuthenticatedAction,
} from '@/providers/AuthenticatedActionProvider';

const mocks = vi.hoisted(() => ({
  account: {
    isConnected: false,
    connect: vi.fn<() => Promise<ConnectOutcome>>(),
  },
}));

vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocks.account,
}));

let root: Root;
let container: HTMLDivElement;
let authContext: ReturnType<typeof useAuthenticatedAction> | undefined;

function CaptureAuthAction(): ReactElement | null {
  const value = useAuthenticatedAction();
  useEffect(() => {
    authContext = value;
  }, [value]);
  return null;
}

function context(): ReturnType<typeof useAuthenticatedAction> {
  if (authContext === undefined) {
    throw new Error('auth action context has not rendered');
  }
  return authContext;
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(
      <AuthenticatedActionProvider>
        <CaptureAuthAction />
      </AuthenticatedActionProvider>,
    );
  });
}

/** Simulates the login completing: the account flips to connected. */
async function reconnect(): Promise<void> {
  mocks.account.isConnected = true;
  await render();
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.account.isConnected = false;
  mocks.account.connect.mockResolvedValue('connected');
  authContext = undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('AuthenticatedActionProvider', () => {
  it('runs a queued action once the login completes', async () => {
    await render();
    const action = vi.fn();

    await act(async () => context().run(action));

    expect(mocks.account.connect).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();

    await reconnect();

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('drops the queued action when the user cancels the login', async () => {
    mocks.account.connect.mockResolvedValue('cancelled');
    await render();
    const action = vi.fn();

    await act(async () => context().run(action));

    // A later, unrelated connection must not replay the abandoned action.
    await reconnect();

    expect(action).not.toHaveBeenCalled();
  });

  it('does not let an older cancelled login clear a newer queued action', async () => {
    let cancelFirst: ((outcome: ConnectOutcome) => void) | undefined;
    const firstLogin = new Promise<ConnectOutcome>((resolve) => {
      cancelFirst = resolve;
    });
    mocks.account.connect
      .mockReturnValueOnce(firstLogin)
      .mockResolvedValueOnce('connected');
    await render();
    const firstAction = vi.fn();
    const latestAction = vi.fn();

    await act(async () => {
      context().run(firstAction);
      context().run(latestAction);
    });

    await act(async () => {
      cancelFirst?.('cancelled');
      await firstLogin;
    });
    await reconnect();

    expect(firstAction).not.toHaveBeenCalled();
    expect(latestAction).toHaveBeenCalledTimes(1);
  });

  it('drops the queued action when the login fails', async () => {
    mocks.account.connect.mockRejectedValue(new Error('network failed'));
    await render();
    const action = vi.fn();

    await act(async () => context().run(action));

    await reconnect();

    expect(action).not.toHaveBeenCalled();
  });

  it('drops the queued action when the login throws synchronously', async () => {
    mocks.account.connect.mockImplementation(() => {
      throw new Error('provider unavailable');
    });
    await render();
    const action = vi.fn();

    expect(() => context().run(action)).not.toThrow();

    await reconnect();

    expect(action).not.toHaveBeenCalled();
  });

  it('runs the action immediately while already connected', async () => {
    mocks.account.isConnected = true;
    await render();
    const action = vi.fn();

    await act(async () => context().run(action));

    expect(action).toHaveBeenCalledTimes(1);
    expect(mocks.account.connect).not.toHaveBeenCalled();
  });
});
