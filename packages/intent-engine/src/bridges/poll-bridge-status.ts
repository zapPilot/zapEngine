export async function pollBridgeStatus<T>(params: {
  fetchStatus: () => Promise<T>;
  isTerminal: (status: T) => boolean;
  signal?: AbortSignal;
  intervalMs?: number;
}): Promise<T> {
  const intervalMs = params.intervalMs ?? 3_000;
  for (;;) {
    if (params.signal?.aborted) {
      throw new DOMException('Bridge status polling aborted', 'AbortError');
    }
    const status = await params.fetchStatus();
    if (params.isTerminal(status)) {
      return status;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      params.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(
            new DOMException('Bridge status polling aborted', 'AbortError'),
          );
        },
        { once: true },
      );
    });
  }
}
