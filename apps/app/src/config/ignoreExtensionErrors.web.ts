/**
 * Dev-only guard that keeps uncaught errors originating entirely inside
 * browser extensions out of Expo's dev error overlay. Wallet extensions
 * (MetaMask, Rabby, Ambire, …) contend for `window.ethereum` on every page;
 * the losers throw unhandled errors from their inpage scripts on page load,
 * and the overlay would present them as app errors.
 *
 * Only propagation to later window listeners (the overlay's — registered by
 * `@expo/log-box` inside a React effect, long after module evaluation) is
 * stopped; the errors still reach the browser console unchanged.
 */

const EXTENSION_PROTOCOL = 'chrome-extension://';

/** True when the uncaught error was thrown by an extension script. */
export function isExtensionErrorEvent(
  event: Pick<ErrorEvent, 'filename'>,
): boolean {
  return event.filename.startsWith(EXTENSION_PROTOCOL);
}

/**
 * True when an unhandled rejection's stack lives entirely inside extension
 * scripts. A single app frame (http/https source) keeps the rejection flowing
 * to the overlay.
 */
export function isExtensionOnlyRejection(reason: unknown): boolean {
  if (!(reason instanceof Error) || typeof reason.stack !== 'string') {
    return false;
  }
  return (
    reason.stack.includes(EXTENSION_PROTOCOL) &&
    !reason.stack.includes('http://') &&
    !reason.stack.includes('https://')
  );
}

export function installExtensionErrorFilter(
  target: Pick<Window, 'addEventListener'>,
): void {
  target.addEventListener('error', (event) => {
    if (isExtensionErrorEvent(event)) {
      event.stopImmediatePropagation();
    }
  });
  target.addEventListener('unhandledrejection', (event) => {
    if (isExtensionOnlyRejection(event.reason)) {
      event.stopImmediatePropagation();
    }
  });
}

// `typeof` guards keep this module inert under Vitest's node environment,
// where neither `__DEV__` nor `window` exists.
if (
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  typeof window !== 'undefined'
) {
  installExtensionErrorFilter(window);
}
