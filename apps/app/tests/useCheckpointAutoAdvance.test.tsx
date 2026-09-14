// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCheckpointAutoAdvance } from '@/hooks/useCheckpointAutoAdvance';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let active: { root: Root; container: HTMLDivElement } | null = null;

function Probe({ id, advance }: { id: string | null; advance: () => void }) {
  useCheckpointAutoAdvance(id, advance);
  return null;
}

async function mount(props: { id: string | null; advance: () => void }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  active = { root, container };
  await act(async () => {
    root.render(createElement(Probe, props));
  });
  return async (next: { id: string | null; advance: () => void }) => {
    await act(async () => {
      root.render(createElement(Probe, next));
    });
  };
}

afterEach(async () => {
  if (!active) return;
  await act(async () => active?.root.unmount());
  active.container.remove();
  active = null;
});

describe('useCheckpointAutoAdvance', () => {
  it('advances once when a checkpoint appears', async () => {
    const advance = vi.fn();
    const rerender = await mount({ id: 'calls-1:1', advance });

    await rerender({ id: 'calls-1:1', advance });
    await rerender({ id: 'calls-1:1', advance: vi.fn() });

    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('does nothing while there is no checkpoint to advance', async () => {
    const advance = vi.fn();
    await mount({ id: null, advance });

    expect(advance).not.toHaveBeenCalled();
  });

  it('advances again only for the next checkpoint', async () => {
    const advance = vi.fn();
    const rerender = await mount({ id: 'calls-1:1', advance });

    await rerender({ id: 'calls-2:2', advance });

    expect(advance).toHaveBeenCalledTimes(2);
  });

  it('does not replay a checkpoint that paused and came back', async () => {
    // An error clears the key; clearing the error must not re-prompt the wallet.
    const advance = vi.fn();
    const rerender = await mount({ id: 'calls-1:1', advance });

    await rerender({ id: null, advance });
    await rerender({ id: 'calls-1:1', advance });

    expect(advance).toHaveBeenCalledTimes(1);
  });
});
