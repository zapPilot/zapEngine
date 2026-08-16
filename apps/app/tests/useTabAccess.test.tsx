// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTabAccess } from '@/integration/useTabAccess';
import { useTabAccess as useTabAccessIos } from '@/integration/useTabAccess.ios';

const mocks = vi.hoisted(() => ({
  account: {
    connect: vi.fn(),
    isConnected: false,
  },
}));

vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocks.account,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function TabAccessCapture({
  hook,
  onValue,
}: {
  hook: typeof useTabAccess;
  onValue: (value: ReturnType<typeof useTabAccess>) => void;
}): ReactElement | null {
  onValue(hook());
  return null;
}

async function renderTabAccess(hook: typeof useTabAccess) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | undefined;
  let value: ReturnType<typeof useTabAccess> | undefined;
  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(TabAccessCapture, {
        hook,
        onValue: (result) => {
          value = result;
        },
      }),
    );
  });
  if (!value || !root) throw new Error('useTabAccess did not render');
  return {
    get value() {
      if (!value) throw new Error('useTabAccess did not render');
      return value;
    },
    unmount: async () => {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.connect.mockResolvedValue(undefined);
  mocks.account.isConnected = false;
});

describe('useTabAccess', () => {
  it('gates account-only tabs behind isConnected', async () => {
    const rendered = await renderTabAccess(useTabAccess);

    expect(rendered.value.isAccessible('account')).toBe(false);
    expect(rendered.value.isAccessible('podcast')).toBe(true);
    await rendered.unmount();
  });

  it('delegates connect to useAccount', async () => {
    const rendered = await renderTabAccess(useTabAccess);

    await act(async () => rendered.value.connect());

    expect(mocks.account.connect).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });
});

describe('iOS useTabAccess', () => {
  it('makes every tab accessible without an account', async () => {
    const rendered = await renderTabAccess(useTabAccessIos);

    expect(rendered.value.isAccessible('account')).toBe(true);
    expect(rendered.value.isAccessible('strategy')).toBe(true);
    await rendered.unmount();
  });

  it('exposes a no-op connect', async () => {
    const rendered = await renderTabAccess(useTabAccessIos);

    await expect(rendered.value.connect()).resolves.toBeUndefined();
    expect(mocks.account.connect).not.toHaveBeenCalled();
    await rendered.unmount();
  });
});
