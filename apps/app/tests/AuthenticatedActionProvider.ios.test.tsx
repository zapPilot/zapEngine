// @vitest-environment jsdom

import { act, type ReactElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthenticatedActionProvider,
  useAuthenticatedAction,
} from '@/providers/AuthenticatedActionProvider.ios';

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

async function mountProvider(): Promise<void> {
  await act(async () => {
    root.render(
      <AuthenticatedActionProvider>
        <CaptureAuthAction />
      </AuthenticatedActionProvider>,
    );
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  authContext = undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('iOS AuthenticatedActionProvider', () => {
  it('runs the action immediately without waiting for authentication', async () => {
    await mountProvider();
    const action = vi.fn();

    act(() => context().run(action));

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('exposes a no-op cancel', async () => {
    await mountProvider();

    expect(() => context().cancel()).not.toThrow();
  });
});
