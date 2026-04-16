/**
 * Abort Control and Timeout Management
 * Handles request timeouts and abort signal management
 */

export function createTimeoutController(
  timeout: number,
  externalSignal?: AbortSignal
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const cleanup = () => {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", handleExternalAbort);
    }
  };

  const handleExternalAbort = () => {
    controller.abort((externalSignal as AbortSignal).reason);
  };

  if (externalSignal) {
    externalSignal.addEventListener("abort", handleExternalAbort);
  }

  return { signal: controller.signal, cleanup };
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}
