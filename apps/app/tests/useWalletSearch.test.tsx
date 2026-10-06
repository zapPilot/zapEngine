// @vitest-environment jsdom
import { act } from 'react';
import { useWalletSearch } from '../src/integration/useWalletSearch';
import { renderHook } from './support/renderHook';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), setView: vi.fn() }));
vi.mock('@zapengine/app-core/services/accountService', () => ({
  getUserByWallet: mocks.lookup,
}));
vi.mock('@/integration/bundleViewStore', () => ({
  setBundleView: mocks.setView,
}));
const own = '0x1234567890abcdef1234567890abcdef12345678';
const other = '0x2234567890abcdef1234567890abcdef12345678';
beforeEach(() => vi.clearAllMocks());
describe('wallet lookup without account creation', () => {
  it('handles own/empty/invalid input without a lookup', async () => {
    const hook = renderHook(() => useWalletSearch('own', [own]));
    await act(() => hook.result.current.search('bad'));
    expect(hook.result.current.state).toBe('invalid');
    await act(() => hook.result.current.search(own));
    expect(mocks.setView).toHaveBeenLastCalledWith(null);
    await act(() => hook.result.current.search(''));
    expect(hook.result.current.state).toBe('idle');
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it('looks up only verified addresses and clears a matching own bundle', async () => {
    const hook = renderHook(() => useWalletSearch('own', [own]));
    mocks.lookup
      .mockResolvedValueOnce({ user_id: 'visited' })
      .mockResolvedValueOnce({ user_id: 'own' });
    await act(() => hook.result.current.search(other));
    expect(mocks.lookup).toHaveBeenCalledWith(other, { verifiedOnly: true });
    expect(mocks.setView).toHaveBeenLastCalledWith({
      userId: 'visited',
      matchedAddress: other,
    });
    await act(() => hook.result.current.search(other));
    expect(mocks.setView).toHaveBeenLastCalledWith(null);
  });
  it.each([
    [{ status: 404 }, 'notFound'],
    [new Error('network'), 'error'],
    [null, 'error'],
  ])('reports lookup failure %s', async (error, state) => {
    mocks.lookup.mockRejectedValue(error);
    const hook = renderHook(() => useWalletSearch(null, []));
    await act(() => hook.result.current.search(other));
    expect(hook.result.current.state).toBe(state);
    expect(mocks.setView).not.toHaveBeenCalled();
  });
  it('discards responses superseded by another search or clear', async () => {
    let resolve!: (value: { user_id: string }) => void;
    mocks.lookup
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce({ user_id: 'new' });
    const hook = renderHook(() => useWalletSearch(null, []));
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.search(other);
    });
    expect(hook.result.current.state).toBe('loading');
    await act(() => hook.result.current.search(own));
    await act(async () => {
      resolve({ user_id: 'old' });
      await pending;
    });
    expect(mocks.setView).toHaveBeenCalledTimes(1);
    expect(mocks.setView).toHaveBeenLastCalledWith({
      userId: 'new',
      matchedAddress: own,
    });
    act(() => hook.result.current.clear());
    expect(mocks.setView).toHaveBeenLastCalledWith(null);
  });
  it('does not publish a rejected lookup after unmount', async () => {
    let reject!: (error: Error) => void;
    mocks.lookup.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const hook = renderHook(() => useWalletSearch(null, []));
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.search(other);
    });
    hook.unmount();
    await act(async () => {
      reject(new Error('stale'));
      await pending;
    });
    expect(mocks.setView).not.toHaveBeenCalled();
  });
});
