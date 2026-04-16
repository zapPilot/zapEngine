import { useCallback, useEffect, useRef, useState } from "react";

import { extractErrorMessage } from "@/lib/errors";
import {
  disconnectTelegram,
  getTelegramStatus,
  requestTelegramToken,
  type TelegramStatus,
} from "@/services";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 120_000;

export type TelegramConnectionViewState =
  | { kind: "loading" }
  | { kind: "idle"; status: TelegramStatus }
  | { kind: "connecting"; deepLink: string }
  | { kind: "error"; message: string };

interface UseTelegramConnectionStateParams {
  isOpen: boolean;
  userId?: string | undefined;
}

interface UseTelegramConnectionStateResult {
  view: TelegramConnectionViewState;
  isDisconnecting: boolean;
  handleConnect: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  handleRetry: () => void;
}

const createTimeoutView = (): TelegramConnectionViewState => ({
  kind: "error",
  message: "Connection timed out. Please try again.",
});

const createLoadErrorView = (): TelegramConnectionViewState => ({
  kind: "error",
  message: "Failed to load Telegram status.",
});

/**
 * Manages Telegram connection state, polling, and retry flows for the settings modal.
 */
export const useTelegramConnectionState = ({
  isOpen,
  userId,
}: UseTelegramConnectionStateParams): UseTelegramConnectionStateResult => {
  const [view, setView] = useState<TelegramConnectionViewState>({
    kind: "loading",
  });
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const stopPolling = useCallback((): void => {
    if (!pollTimerRef.current) {
      return;
    }

    clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  const fetchStatus = useCallback(async (): Promise<TelegramStatus | null> => {
    if (!userId) {
      return null;
    }

    try {
      const status = await getTelegramStatus(userId);
      setView({ kind: "idle", status });
      return status;
    } catch {
      setView(createLoadErrorView());
      return null;
    }
  }, [userId]);

  const startPolling = useCallback((): void => {
    stopPolling();
    pollStartRef.current = Date.now();

    pollTimerRef.current = setInterval(() => {
      const hasTimedOut =
        Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS;

      if (hasTimedOut) {
        stopPolling();
        setView(createTimeoutView());
        return;
      }

      if (!userId) {
        return;
      }

      const pollConnectionStatus = async (): Promise<void> => {
        try {
          const status = await getTelegramStatus(userId);
          if (!status.isConnected) {
            return;
          }

          stopPolling();
          setView({ kind: "idle", status });
        } catch {
          // Keep polling on transient errors.
        }
      };

      void pollConnectionStatus();
    }, POLL_INTERVAL_MS);
  }, [stopPolling, userId]);

  useEffect(() => {
    if (isOpen && userId) {
      setView({ kind: "loading" });
      void fetchStatus();
    }

    return stopPolling;
  }, [fetchStatus, isOpen, stopPolling, userId]);

  const handleConnect = useCallback(async (): Promise<void> => {
    if (!userId) {
      return;
    }

    try {
      const { deepLink } = await requestTelegramToken(userId);
      window.open(deepLink, "_blank");
      setView({ kind: "connecting", deepLink });
      startPolling();
    } catch (error) {
      setView({
        kind: "error",
        message: extractErrorMessage(
          error,
          "Failed to generate connection link."
        ),
      });
    }
  }, [startPolling, userId]);

  const handleDisconnect = useCallback(async (): Promise<void> => {
    if (!userId) {
      return;
    }

    setIsDisconnecting(true);

    try {
      await disconnectTelegram(userId);
      await fetchStatus();
    } catch (error) {
      setView({
        kind: "error",
        message: extractErrorMessage(error, "Failed to disconnect Telegram."),
      });
    } finally {
      setIsDisconnecting(false);
    }
  }, [fetchStatus, userId]);

  const handleRetry = useCallback((): void => {
    stopPolling();
    setView({ kind: "loading" });
    void fetchStatus();
  }, [fetchStatus, stopPolling]);

  return {
    view,
    isDisconnecting,
    handleConnect,
    handleDisconnect,
    handleRetry,
  };
};
