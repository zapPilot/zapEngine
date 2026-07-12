import { describe, expect, it, vi } from 'vitest';

import { createAuthenticatedActionModel } from '@/integration/authenticatedActionModel';

describe('authenticated action model', () => {
  it('runs immediately when already authenticated', () => {
    const action = vi.fn();
    const model = createAuthenticatedActionModel();

    expect(model.request(true, action)).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('resumes the latest pending action exactly once after authentication', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const model = createAuthenticatedActionModel();

    expect(model.request(false, first)).toBe(true);
    expect(model.request(false, latest)).toBe(true);
    model.resume();
    model.resume();

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('does not resume a cancelled action', () => {
    const action = vi.fn();
    const model = createAuthenticatedActionModel();

    model.request(false, action);
    model.cancel();
    model.resume();

    expect(action).not.toHaveBeenCalled();
  });
});
