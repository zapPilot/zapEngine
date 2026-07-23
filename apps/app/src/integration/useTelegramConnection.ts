import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import {
  disconnectTelegram,
  getTelegramStatus,
  requestTelegramToken,
} from '@zapengine/app-core/services';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import {
  createTelegramConnectionModel,
  TELEGRAM_POLL_INTERVAL_MS,
  type TelegramConnectionSnapshot,
  type TelegramConnectionView,
} from '@/integration/telegramConnectionModel';

export interface UseTelegramConnectionParams {
  /** Zap Pilot user id; null until a wallet is connected. */
  userId: string | null;
  /** Opens the Telegram deep link (RN layer injects `expo-linking`). */
  openLink: (url: string) => void;
}

export interface UseTelegramConnection {
  /** False until a wallet is connected — the card prompts to connect first. */
  enabled: boolean;
  view: TelegramConnectionView;
  isDisconnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  retry: () => void;
}

const DISABLED_SNAPSHOT: TelegramConnectionSnapshot = {
  view: { kind: 'loading' },
  isDisconnecting: false,
};
const NOOP_SUBSCRIBE = (): (() => void) => () => undefined;
const readClock = (): number => Date.now();

/**
 * Drives the Telegram connect flow for the Account screen: wires app-core
 * services into {@link createTelegramConnectionModel} and owns the verification
 * poll interval. All decision logic lives in the (tested) model, exposed as an
 * external store so React subscribes rather than mirroring state in an effect.
 */
export function useTelegramConnection({
  userId,
  openLink,
}: UseTelegramConnectionParams): UseTelegramConnection {
  const model = useMemo(
    () =>
      userId
        ? createTelegramConnectionModel(userId, {
            getStatus: getTelegramStatus,
            requestToken: requestTelegramToken,
            disconnect: disconnectTelegram,
            openLink,
            now: readClock,
            toErrorMessage: extractErrorMessage,
          })
        : null,
    [userId, openLink],
  );

  const snapshot = useSyncExternalStore(
    model ? model.subscribe : NOOP_SUBSCRIBE,
    model ? model.getSnapshot : () => DISABLED_SNAPSHOT,
  );

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = useCallback((): void => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Load status on mount / user change; always tear the poll down on cleanup.
  useEffect(() => {
    if (!model) {
      return;
    }
    void model.load();
    return stopPolling;
  }, [model, stopPolling]);

  const startPolling = useCallback((): void => {
    stopPolling();
    pollRef.current = setInterval(() => {
      void model?.poll().then((outcome) => {
        if (outcome !== 'pending') {
          stopPolling();
        }
      });
    }, TELEGRAM_POLL_INTERVAL_MS);
  }, [model, stopPolling]);

  const connect = useCallback((): void => {
    void model?.connect().then(() => {
      if (model.getView().kind === 'connecting') {
        startPolling();
      }
    });
  }, [model, startPolling]);

  const disconnect = useCallback((): void => {
    void model?.disconnect();
  }, [model]);

  const retry = useCallback((): void => {
    stopPolling();
    void model?.retry();
  }, [model, stopPolling]);

  return {
    enabled: model !== null,
    view: snapshot.view,
    isDisconnecting: snapshot.isDisconnecting,
    connect,
    disconnect,
    retry,
  };
}
