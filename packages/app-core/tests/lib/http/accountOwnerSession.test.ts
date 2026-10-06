import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AccountSessionRequiredError,
  configureAccountOwnerSession,
  withOwnerAuth,
} from '../../../src/lib/http/accountOwnerSession';

let dispose: (() => void) | undefined;
afterEach(() => dispose?.());
const options = { userId: 'owner', interactive: true };

describe('owner session request registry', () => {
  it('requires configuration and a token', async () => {
    await expect(withOwnerAuth(options, vi.fn())).rejects.toBeInstanceOf(
      AccountSessionRequiredError,
    );
    dispose = configureAccountOwnerSession({
      getToken: async () => null,
      invalidate: vi.fn(),
    });
    const request = vi.fn();
    await expect(withOwnerAuth(options, request)).rejects.toBeInstanceOf(
      AccountSessionRequiredError,
    );
    expect(request).not.toHaveBeenCalled();
  });
  it('passes user and freshness options and authorizes a request', async () => {
    const getToken = vi.fn().mockResolvedValue('token');
    dispose = configureAccountOwnerSession({ getToken, invalidate: vi.fn() });
    const request = vi.fn().mockResolvedValue('ok');
    expect(await withOwnerAuth({ ...options, recent: true }, request)).toBe(
      'ok',
    );
    expect(request).toHaveBeenCalledWith({ Authorization: 'Bearer token' });
    expect(getToken).toHaveBeenCalledWith({ ...options, recent: true });
  });
  it('invalidates a 401 and retries an interactive action exactly once', async () => {
    const getToken = vi
      .fn()
      .mockResolvedValueOnce('expired')
      .mockResolvedValueOnce('new');
    const invalidate = vi.fn();
    dispose = configureAccountOwnerSession({ getToken, invalidate });
    const request = vi
      .fn()
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce('ok');
    expect(await withOwnerAuth(options, request)).toBe('ok');
    expect(invalidate).toHaveBeenCalledWith('owner');
    expect(getToken).toHaveBeenLastCalledWith({ ...options, recent: true });
    expect(request).toHaveBeenLastCalledWith({ Authorization: 'Bearer new' });
  });
  it('never prompts for a background 401', async () => {
    const getToken = vi.fn().mockResolvedValue('expired');
    const invalidate = vi.fn();
    dispose = configureAccountOwnerSession({ getToken, invalidate });
    await expect(
      withOwnerAuth(
        { userId: 'owner', interactive: false },
        vi.fn().mockRejectedValue({ status: 401 }),
      ),
    ).rejects.toBeInstanceOf(AccountSessionRequiredError);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith('owner');
  });
  it.each([new Error('network'), { status: 403 }, null, 'error'])(
    'does not retry other errors (%s)',
    async (error) => {
      const invalidate = vi.fn();
      dispose = configureAccountOwnerSession({
        getToken: async () => 'token',
        invalidate,
      });
      await expect(
        withOwnerAuth(options, vi.fn().mockRejectedValue(error)),
      ).rejects.toBe(error);
      expect(invalidate).not.toHaveBeenCalled();
    },
  );
  it('does not retry when the fresh signature is unavailable', async () => {
    dispose = configureAccountOwnerSession({
      getToken: vi
        .fn()
        .mockResolvedValueOnce('expired')
        .mockResolvedValueOnce(null),
      invalidate: vi.fn(),
    });
    const request = vi.fn().mockRejectedValue({ status: 401 });
    await expect(withOwnerAuth(options, request)).rejects.toBeInstanceOf(
      AccountSessionRequiredError,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not dispose a replacement provider', async () => {
    const old = configureAccountOwnerSession({
      getToken: async () => 'old',
      invalidate: vi.fn(),
    });
    dispose = configureAccountOwnerSession({
      getToken: async () => 'new',
      invalidate: vi.fn(),
    });
    old();
    const request = vi.fn().mockResolvedValue('ok');
    await withOwnerAuth(options, request);
    expect(request).toHaveBeenCalledWith({ Authorization: 'Bearer new' });
  });
});
