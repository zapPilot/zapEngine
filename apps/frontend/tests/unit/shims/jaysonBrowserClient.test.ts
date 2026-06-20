import { describe, expect, it, vi } from 'vitest';

import JaysonBrowserClient from '@/shims/jaysonBrowserClient';

describe('JaysonBrowserClient', () => {
  it('calls callback with error when callback is passed as 4th argument', () => {
    const client = new JaysonBrowserClient();
    const callback = vi.fn();

    client.request('someMethod', { param: 'value' }, 'id', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      new Error('Solana RPC is not available in the zapEngine frontend bundle'),
    );
  });

  it('uses params as callback when params is a function', () => {
    const client = new JaysonBrowserClient();
    const callback = vi.fn();

    client.request('someMethod', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      new Error('Solana RPC is not available in the zapEngine frontend bundle'),
    );
  });

  it('uses id as callback when id is a function and params is not', () => {
    const client = new JaysonBrowserClient();
    const callback = vi.fn();

    client.request('someMethod', { param: 'value' }, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      new Error('Solana RPC is not available in the zapEngine frontend bundle'),
    );
  });

  it('calls callback with undefined response on success path', () => {
    const client = new JaysonBrowserClient();
    const callback = vi.fn();

    client.request('someMethod', { param: 'value' }, 'id', callback);

    const errorArg = callback.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(errorArg.message).toBe(
      'Solana RPC is not available in the zapEngine frontend bundle',
    );
    expect(callback.mock.calls[0][1]).toBeUndefined();
  });
});
