import { describe, expect, it, vi } from 'vitest';

import { createStrategyStartAction } from '@/integration/strategyStartAction';

describe('createStrategyStartAction', () => {
  it('hands navigation to the authenticated-action coordinator', () => {
    let continuation: (() => void) | null = null;
    const run = vi.fn((action: () => void) => {
      continuation = action;
    });
    const navigate = vi.fn();

    createStrategyStartAction(run, navigate)();

    expect(run).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    (continuation as (() => void) | null)?.();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
