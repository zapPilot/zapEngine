/**
 * Opens a connect flow without caring about the result — the shape every
 * `onPress` needs. Never return a connect promise from a React Native press
 * handler: the handler's value is discarded, so a rejection would be
 * unhandled and reported to Sentry as a production error.
 *
 * Kept apart from `useAccount` so podcast-only surfaces (the iOS bundle) can
 * use it without pulling the wallet provider in — see
 * `scripts/assert-ios-bundle-clean.cjs`.
 */
export function requestAccountConnection(connectable: {
  connect: () => Promise<unknown>;
}): void {
  try {
    void connectable.connect().catch(() => undefined);
  } catch {
    // A provider may throw before it can return its promise. Press handlers
    // must contain that failure just like an async rejection.
  }
}
