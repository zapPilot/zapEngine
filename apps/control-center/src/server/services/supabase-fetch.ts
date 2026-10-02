const REQUEST_TIMEOUT_MS = 10_000;

/** Bound the entire transport, including body consumption, before PostgREST
 * processes the response. SDK retries are disabled by the client factory. */
export function createBoundedSupabaseFetch(
  fetchImpl: typeof fetch,
): typeof fetch {
  return async (input, init) => {
    const caller =
      init?.signal ?? (input instanceof Request ? input.signal : null);
    caller?.throwIfAborted();
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort(caller?.reason);
    caller?.addEventListener('abort', onCallerAbort, { once: true });
    const timer = setTimeout(() => {
      controller.abort(
        new DOMException('Supabase request exceeded 10 seconds', 'AbortError'),
      );
    }, REQUEST_TIMEOUT_MS);
    let onAbort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const read = async () => {
      const response = await fetchImpl(input, {
        ...init,
        signal: controller.signal,
      });
      const bytes = await response.arrayBuffer();
      controller.signal.throwIfAborted();
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      const noBody =
        method === 'HEAD' || [204, 205, 304].includes(response.status);
      return new Response(noBody ? null : bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
    try {
      return await Promise.race([read(), cancelled]);
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener('abort', onCallerAbort);
      controller.signal.removeEventListener('abort', onAbort);
    }
  };
}
