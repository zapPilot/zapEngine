import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTelegramConnectionState } from "@/components/wallet/portfolio/modals/useTelegramConnectionState";
import type { TelegramStatus } from "@/services";

const {
  mockDisconnectTelegram,
  mockGetTelegramStatus,
  mockRequestTelegramToken,
} = vi.hoisted(() => ({
  mockDisconnectTelegram: vi.fn(),
  mockGetTelegramStatus: vi.fn(),
  mockRequestTelegramToken: vi.fn(),
}));

vi.mock("@/services", () => ({
  disconnectTelegram: mockDisconnectTelegram,
  getTelegramStatus: mockGetTelegramStatus,
  requestTelegramToken: mockRequestTelegramToken,
}));

const disconnectedStatus: TelegramStatus = {
  isConnected: false,
  isEnabled: false,
  connectedAt: null,
};

const connectedStatus: TelegramStatus = {
  isConnected: true,
  isEnabled: true,
  connectedAt: "2025-03-01T10:00:00Z",
};

const telegramTokenResponse = {
  token: "abc123",
  botName: "zap_pilot_bot",
  deepLink: "https://t.me/zap_pilot_bot?start=abc123",
  expiresAt: "2025-03-01T10:05:00Z",
};

const mockPollingTimer = () => {
  let intervalCallback: (() => void) | undefined;

  const setIntervalSpy = vi
    .spyOn(globalThis, "setInterval")
    .mockImplementation(callback => {
      intervalCallback = callback as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    });

  const clearIntervalSpy = vi
    .spyOn(globalThis, "clearInterval")
    .mockImplementation(() => undefined);

  return {
    clearIntervalSpy,
    setIntervalSpy,
    triggerInterval: async () => {
      await act(async () => {
        intervalCallback?.();
        await Promise.resolve();
      });
    },
  };
};

describe("useTelegramConnectionState", () => {
  let originalWindowOpen: typeof window.open;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWindowOpen = window.open;
    window.open = vi.fn();

    mockGetTelegramStatus.mockResolvedValue(disconnectedStatus);
    mockRequestTelegramToken.mockResolvedValue(telegramTokenResponse);
    mockDisconnectTelegram.mockResolvedValue({
      success: true,
      message: "Disconnected",
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.open = originalWindowOpen;
  });

  it("loads the current Telegram status when the modal opens", async () => {
    const { result } = renderHook(() =>
      useTelegramConnectionState({ isOpen: true, userId: "user-1" })
    );

    await waitFor(() => {
      expect(result.current.view).toEqual({
        kind: "idle",
        status: disconnectedStatus,
      });
    });

    expect(mockGetTelegramStatus).toHaveBeenCalledWith("user-1");
  });

  it("shows a load error when the initial status request fails", async () => {
    mockGetTelegramStatus.mockRejectedValueOnce(new Error("load failed"));

    const { result } = renderHook(() =>
      useTelegramConnectionState({ isOpen: true, userId: "user-1" })
    );

    await waitFor(() => {
      expect(result.current.view).toEqual({
        kind: "error",
        message: "Failed to load Telegram status.",
      });
    });
  });

  it("keeps the hook in a no-op state when there is no userId", async () => {
    const { result } = renderHook(() =>
      useTelegramConnectionState({ isOpen: true })
    );

    expect(mockGetTelegramStatus).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleConnect();
      await result.current.handleDisconnect();
      result.current.handleRetry();
    });

    expect(mockRequestTelegramToken).not.toHaveBeenCalled();
    expect(mockDisconnectTelegram).not.toHaveBeenCalled();
    expect(mockGetTelegramStatus).not.toHaveBeenCalled();
    expect(result.current.view).toEqual({ kind: "loading" });
    expect(result.current.isDisconnecting).toBe(false);
  });

  it("opens the Telegram deep link when connect succeeds", async () => {
    const { result, unmount } = renderHook(() =>
      useTelegramConnectionState({ isOpen: false, userId: "user-1" })
    );

    await act(async () => {
      await result.current.handleConnect();
    });

    expect(mockRequestTelegramToken).toHaveBeenCalledWith("user-1");
    expect(window.open).toHaveBeenCalledWith(
      telegramTokenResponse.deepLink,
      "_blank"
    );
    expect(result.current.view).toEqual({
      kind: "connecting",
      deepLink: telegramTokenResponse.deepLink,
    });

    unmount();
  });

  it("polls until Telegram is connected", async () => {
    const { clearIntervalSpy, triggerInterval } = mockPollingTimer();
    mockGetTelegramStatus
      .mockResolvedValueOnce(disconnectedStatus)
      .mockResolvedValueOnce(connectedStatus);

    const { result } = renderHook(() =>
      useTelegramConnectionState({ isOpen: false, userId: "user-1" })
    );

    await act(async () => {
      await result.current.handleConnect();
    });

    await triggerInterval();

    expect(result.current.view).toEqual({
      kind: "connecting",
      deepLink: telegramTokenResponse.deepLink,
    });

    await triggerInterval();

    expect(result.current.view).toEqual({
      kind: "idle",
      status: connectedStatus,
    });
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("surfaces a timeout error when polling runs too long", async () => {
    const { clearIntervalSpy, triggerInterval } = mockPollingTimer();
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy.mockReturnValue(0);

    const { result } = renderHook(() =>
      useTelegramConnectionState({ isOpen: false, userId: "user-1" })
    );

    await act(async () => {
      await result.current.handleConnect();
    });

    dateNowSpy.mockReturnValue(123_000);
    await triggerInterval();

    expect(result.current.view).toEqual({
      kind: "error",
      message: "Connection timed out. Please try again.",
    });
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("shows the request-token error message when connect fails", async () => {
    mockRequestTelegramToken.mockRejectedValueOnce(
      new Error("Failed to generate connection link.")
    );

    const { result } = renderHook(() =>
      useTelegramConnectionState({ isOpen: false, userId: "user-1" })
    );

    await act(async () => {
      await result.current.handleConnect();
    });

    expect(result.current.view).toEqual({
      kind: "error",
      message: "Failed to generate connection link.",
    });
  });

  it("refreshes the status after a successful disconnect", async () => {
    mockGetTelegramStatus
      .mockResolvedValueOnce(connectedStatus)
      .mockResolvedValueOnce(disconnectedStatus);

    const { result } = renderHook(() =>
      useTelegramConnectionState({ isOpen: true, userId: "user-1" })
    );

    await waitFor(() => {
      expect(result.current.view).toEqual({
        kind: "idle",
        status: connectedStatus,
      });
    });

    await act(async () => {
      await result.current.handleDisconnect();
    });

    expect(mockDisconnectTelegram).toHaveBeenCalledWith("user-1");
    expect(result.current.isDisconnecting).toBe(false);
    expect(result.current.view).toEqual({
      kind: "idle",
      status: disconnectedStatus,
    });
  });

  it("shows the disconnect error message when disconnect fails", async () => {
    mockGetTelegramStatus.mockResolvedValueOnce(connectedStatus);
    mockDisconnectTelegram.mockRejectedValueOnce(
      new Error("Failed to disconnect Telegram.")
    );

    const { result } = renderHook(() =>
      useTelegramConnectionState({ isOpen: true, userId: "user-1" })
    );

    await waitFor(() => {
      expect(result.current.view).toEqual({
        kind: "idle",
        status: connectedStatus,
      });
    });

    await act(async () => {
      await result.current.handleDisconnect();
    });

    expect(result.current.isDisconnecting).toBe(false);
    expect(result.current.view).toEqual({
      kind: "error",
      message: "Failed to disconnect Telegram.",
    });
  });

  it("resets to loading and refetches when retry is requested", async () => {
    let resolveStatus: ((status: TelegramStatus) => void) | undefined;

    mockGetTelegramStatus.mockRejectedValueOnce(new Error("load failed"));
    mockGetTelegramStatus.mockImplementationOnce(
      () =>
        new Promise<TelegramStatus>(resolve => {
          resolveStatus = resolve;
        })
    );

    const { result } = renderHook(() =>
      useTelegramConnectionState({ isOpen: true, userId: "user-1" })
    );

    await waitFor(() => {
      expect(result.current.view).toEqual({
        kind: "error",
        message: "Failed to load Telegram status.",
      });
    });

    act(() => {
      result.current.handleRetry();
    });

    expect(result.current.view).toEqual({ kind: "loading" });

    await act(async () => {
      resolveStatus?.(connectedStatus);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.view).toEqual({
        kind: "idle",
        status: connectedStatus,
      });
    });
  });

  it("stops polling when the hook unmounts", async () => {
    const { clearIntervalSpy } = mockPollingTimer();
    const { result, unmount } = renderHook(() =>
      useTelegramConnectionState({ isOpen: false, userId: "user-1" })
    );

    await act(async () => {
      await result.current.handleConnect();
    });

    vi.clearAllMocks();
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
