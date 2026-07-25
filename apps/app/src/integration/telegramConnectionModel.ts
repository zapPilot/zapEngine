import type { TelegramStatus } from '@zapengine/app-core/services';

export const TELEGRAM_POLL_INTERVAL_MS = 3_000;
export const TELEGRAM_MAX_POLL_DURATION_MS = 120_000;

/** What the connection card should render. Mirrors the old settings flow. */
export type TelegramConnectionView =
  | { kind: 'loading' }
  | { kind: 'idle'; status: TelegramStatus }
  | { kind: 'connecting'; deepLink: string }
  | { kind: 'error'; message: string };

/** Result of a single poll tick, so the interval owner knows when to stop. */
export type TelegramPollOutcome = 'connected' | 'pending' | 'timed-out';

/** Immutable snapshot for `useSyncExternalStore` — stable ref until it changes. */
export interface TelegramConnectionSnapshot {
  view: TelegramConnectionView;
  isDisconnecting: boolean;
}

export interface TelegramConnectionDeps {
  getStatus(userId: string): Promise<TelegramStatus>;
  requestToken(userId: string): Promise<{ deepLink: string }>;
  disconnect(userId: string): Promise<unknown>;
  /** Opens the Telegram deep link (injected so the model stays platform-free). */
  openLink(url: string): void;
  /** Injected clock so poll timeout is deterministic under test. */
  now(): number;
  /** Extracts a user-facing message from a thrown service error. */
  toErrorMessage(error: unknown, fallback: string): string;
}

export interface TelegramConnectionModel {
  /** Subscribe to snapshot changes (for `useSyncExternalStore`). */
  subscribe(listener: () => void): () => void;
  /** Current immutable snapshot; same reference until state changes. */
  getSnapshot(): TelegramConnectionSnapshot;
  getView(): TelegramConnectionView;
  isDisconnecting(): boolean;
  /** Fetch current status and settle to an idle view. */
  load(): Promise<void>;
  /** Request a token, open the deep link, and enter the connecting state. */
  connect(): Promise<void>;
  /** One poll iteration; the interval owner stops on a non-`pending` result. */
  poll(): Promise<TelegramPollOutcome>;
  disconnect(): Promise<void>;
  /** Reset a timed-out/errored view back to a fresh status fetch. */
  retry(): Promise<void>;
}

const loadErrorView = (): TelegramConnectionView => ({
  kind: 'error',
  message: 'Failed to load Telegram status.',
});

const timeoutView = (): TelegramConnectionView => ({
  kind: 'error',
  message: 'Connection timed out. Please try again.',
});

/**
 * Pure state machine for the Telegram connect flow (deep link + poll for
 * verification). React state, timers, and the deep-link opener are all injected
 * so this is unit-testable in a node environment with a fake clock.
 */
export function createTelegramConnectionModel(
  userId: string,
  deps: TelegramConnectionDeps,
): TelegramConnectionModel {
  let view: TelegramConnectionView = { kind: 'loading' };
  let disconnecting = false;
  let pollStart = 0;
  let snapshot: TelegramConnectionSnapshot = { view, isDisconnecting: false };
  const listeners = new Set<() => void>();

  const emit = (): void => {
    snapshot = { view, isDisconnecting: disconnecting };
    for (const listener of listeners) {
      listener();
    }
  };

  const setView = (next: TelegramConnectionView): void => {
    view = next;
    emit();
  };

  const setDisconnecting = (next: boolean): void => {
    disconnecting = next;
    emit();
  };

  const fetchStatus = async (): Promise<void> => {
    try {
      setView({ kind: 'idle', status: await deps.getStatus(userId) });
    } catch {
      setView(loadErrorView());
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    getView: () => view,
    isDisconnecting: () => disconnecting,
    load: fetchStatus,

    async connect() {
      try {
        const { deepLink } = await deps.requestToken(userId);
        deps.openLink(deepLink);
        pollStart = deps.now();
        setView({ kind: 'connecting', deepLink });
      } catch (error) {
        setView({
          kind: 'error',
          message: deps.toErrorMessage(
            error,
            'Failed to generate connection link.',
          ),
        });
      }
    },

    async poll() {
      if (deps.now() - pollStart > TELEGRAM_MAX_POLL_DURATION_MS) {
        setView(timeoutView());
        return 'timed-out';
      }
      try {
        const status = await deps.getStatus(userId);
        if (!status.isConnected) {
          return 'pending';
        }
        setView({ kind: 'idle', status });
        return 'connected';
      } catch {
        // Keep polling through transient errors.
        return 'pending';
      }
    },

    async disconnect() {
      setDisconnecting(true);
      try {
        await deps.disconnect(userId);
        await fetchStatus();
      } catch (error) {
        setView({
          kind: 'error',
          message: deps.toErrorMessage(error, 'Failed to disconnect Telegram.'),
        });
      } finally {
        setDisconnecting(false);
      }
    },

    async retry() {
      setView({ kind: 'loading' });
      await fetchStatus();
    },
  };
}
