type JsonRpcCallback = (err?: Error | null, response?: unknown) => void;

/**
 * Stub for `jayson/lib/client/browser`, dragged in transitively by
 * @solana/web3.js (via @lifi/sdk). zapEngine targets EVM chains only, so the
 * Solana JSON-RPC path is never exercised at runtime — this stub exists so
 * Rollup can resolve the deep import during `vite build`. If a Solana path is
 * ever hit, it rejects loudly instead of failing silently.
 */
export default class JaysonBrowserClient {
  request(
    _method: string | unknown[],
    params?: unknown,
    id?: unknown,
    callback?: JsonRpcCallback,
  ): void {
    const cb =
      typeof params === 'function'
        ? (params as JsonRpcCallback)
        : typeof id === 'function'
          ? (id as JsonRpcCallback)
          : callback;
    cb?.(
      new Error('Solana RPC is not available in the zapEngine frontend bundle'),
    );
  }
}
