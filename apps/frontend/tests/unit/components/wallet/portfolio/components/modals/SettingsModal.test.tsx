import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsModal } from "@/components/wallet/portfolio/modals/SettingsModal";

// Mock the modal components
vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
  }) => (isOpen ? <div data-testid="mock-modal">{children}</div> : null),
  ModalHeader: ({
    title,
    subtitle,
    onClose,
  }: {
    title: string;
    subtitle: string;
    onClose: () => void;
  }) => (
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <button onClick={onClose} aria-label="Close modal">
        ×
      </button>
    </div>
  ),
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Mock Telegram service functions
const mockGetTelegramStatus = vi.fn();
const mockRequestTelegramToken = vi.fn();
const mockDisconnectTelegram = vi.fn();

vi.mock("@/services", () => ({
  getTelegramStatus: (...args: unknown[]) => mockGetTelegramStatus(...args),
  requestTelegramToken: (...args: unknown[]) =>
    mockRequestTelegramToken(...args),
  disconnectTelegram: (...args: unknown[]) => mockDisconnectTelegram(...args),
}));

vi.mock("@/utils", () => ({
  extractErrorMessage: (err: unknown, fallback: string) => {
    if (err instanceof Error) return err.message;
    return fallback;
  },
}));

describe("SettingsModal", () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
    mockGetTelegramStatus.mockReset();
    mockRequestTelegramToken.mockReset();
    mockDisconnectTelegram.mockReset();
  });

  it("renders when open with Notifications title", () => {
    render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByTestId("mock-modal")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<SettingsModal isOpen={false} onClose={mockOnClose} />);

    expect(screen.queryByTestId("mock-modal")).not.toBeInTheDocument();
  });

  it("displays subtitle about Telegram alerts", () => {
    render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

    expect(
      screen.getByText(/connect telegram to receive portfolio alerts/i)
    ).toBeInTheDocument();
  });

  it("shows connect-wallet message when no userId", () => {
    render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText(/connect your wallet first/i)).toBeInTheDocument();
  });

  it("shows loading state initially with userId", () => {
    mockGetTelegramStatus.mockReturnValue(new Promise(() => undefined));

    const { container } = render(
      <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
    );

    // Loader2 renders an SVG with the animate-spin class
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("shows disconnected state with Connect button", async () => {
    mockGetTelegramStatus.mockResolvedValue({
      isConnected: false,
      isEnabled: false,
      connectedAt: null,
    });

    render(
      <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
    );

    await waitFor(() => {
      expect(screen.getByText("Telegram")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Connect/i })
    ).toBeInTheDocument();
  });

  it("shows connected state with Disconnect button", async () => {
    mockGetTelegramStatus.mockResolvedValue({
      isConnected: true,
      isEnabled: true,
      connectedAt: "2026-01-01T00:00:00Z",
    });

    render(
      <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
    );

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Disconnect/i })
    ).toBeInTheDocument();
  });

  it("calls onClose when modal header close button is clicked", () => {
    render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

    const modalCloseButton = screen.getByRole("button", {
      name: /Close modal/i,
    });
    fireEvent.click(modalCloseButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when footer Close button is clicked", () => {
    render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

    const footerCloseButton = screen.getByRole("button", { name: /^Close$/i });
    fireEvent.click(footerCloseButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  describe("Connect flow", () => {
    it("opens deep link and shows connecting state on successful connect", async () => {
      mockGetTelegramStatus.mockResolvedValue({
        isConnected: false,
        isEnabled: false,
        connectedAt: null,
      });
      mockRequestTelegramToken.mockResolvedValue({
        deepLink: "https://t.me/bot?start=abc",
      });
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Connect/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Connect/i }));

      await waitFor(() => {
        expect(openSpy).toHaveBeenCalledWith(
          "https://t.me/bot?start=abc",
          "_blank"
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Waiting for confirmation/i)
        ).toBeInTheDocument();
      });

      openSpy.mockRestore();
    });

    it("shows error state when connect fails", async () => {
      mockGetTelegramStatus.mockResolvedValue({
        isConnected: false,
        isEnabled: false,
        connectedAt: null,
      });
      mockRequestTelegramToken.mockRejectedValue(
        new Error("Token generation failed")
      );

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Connect/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Connect/i }));

      await waitFor(() => {
        expect(screen.getByText("Token generation failed")).toBeInTheDocument();
      });
    });
  });

  describe("Disconnect flow", () => {
    it("disconnects and refetches status on success", async () => {
      mockGetTelegramStatus
        .mockResolvedValueOnce({
          isConnected: true,
          isEnabled: true,
          connectedAt: "2026-01-01",
        })
        .mockResolvedValueOnce({
          isConnected: false,
          isEnabled: false,
          connectedAt: null,
        });
      mockDisconnectTelegram.mockResolvedValue(undefined);

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Disconnect/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Disconnect/i }));

      await waitFor(() => {
        expect(mockDisconnectTelegram).toHaveBeenCalledWith("0x123");
      });

      await waitFor(() => {
        expect(mockGetTelegramStatus).toHaveBeenCalledTimes(2);
      });
    });

    it("shows error when disconnect fails", async () => {
      mockGetTelegramStatus.mockResolvedValue({
        isConnected: true,
        isEnabled: true,
        connectedAt: "2026-01-01",
      });
      mockDisconnectTelegram.mockRejectedValue(new Error("Disconnect failed"));

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Disconnect/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Disconnect/i }));

      await waitFor(() => {
        expect(screen.getByText("Disconnect failed")).toBeInTheDocument();
      });
    });
  });

  describe("Error recovery", () => {
    it("retries fetching status when Retry is clicked", async () => {
      mockGetTelegramStatus
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          isConnected: false,
          isEnabled: false,
          connectedAt: null,
        });

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load Telegram status/i)
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Connect/i })
        ).toBeInTheDocument();
      });
    });
  });

  describe("fetchStatus without userId", () => {
    it("shows no-user message when modal is opened without userId", () => {
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);
      expect(
        screen.getByText(/connect your wallet first/i)
      ).toBeInTheDocument();
      expect(mockGetTelegramStatus).not.toHaveBeenCalled();
    });

    it("does not call getTelegramStatus when userId is undefined and modal opens", () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} userId={undefined} />
      );
      expect(mockGetTelegramStatus).not.toHaveBeenCalled();
    });
  });

  describe("Polling", () => {
    it("stops polling and shows timeout error after MAX_POLL_DURATION_MS", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      mockGetTelegramStatus.mockResolvedValue({
        isConnected: false,
        isEnabled: false,
        connectedAt: null,
      });
      mockRequestTelegramToken.mockResolvedValue({
        deepLink: "https://t.me/bot?start=abc",
      });
      vi.spyOn(window, "open").mockImplementation(() => null);

      const { act } = await import("@testing-library/react");

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
      );

      // Flush the initial status fetch promise
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(
        screen.getByRole("button", { name: /Connect/i })
      ).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Connect/i }));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText(/Waiting for confirmation/i)).toBeInTheDocument();

      // Advance time past MAX_POLL_DURATION_MS (120_000ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(123_000);
      });

      expect(screen.getByText(/Connection timed out/i)).toBeInTheDocument();

      vi.useRealTimers();
    });

    it("continues polling and recovers after a transient error during polling", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      mockGetTelegramStatus
        .mockResolvedValueOnce({
          isConnected: false,
          isEnabled: false,
          connectedAt: null,
        })
        // First poll interval: transient failure
        .mockRejectedValueOnce(new Error("Network blip"))
        // Second poll interval: success — connection established
        .mockResolvedValue({
          isConnected: true,
          isEnabled: true,
          connectedAt: "2026-01-01",
        });
      mockRequestTelegramToken.mockResolvedValue({
        deepLink: "https://t.me/bot?start=transient",
      });
      vi.spyOn(window, "open").mockImplementation(() => null);

      const { act } = await import("@testing-library/react");

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
      );

      // Flush the initial status fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Click connect to start polling
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Connect/i }));
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText(/Waiting for confirmation/i)).toBeInTheDocument();

      // Advance through first poll (transient error — should keep polling, not error state)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_100);
      });

      // Should still show connecting state (error was swallowed)
      expect(screen.getByText(/Waiting for confirmation/i)).toBeInTheDocument();

      // Advance through second poll (success)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_100);
      });

      expect(screen.getByText("Connected")).toBeInTheDocument();

      vi.useRealTimers();
    });

    it("stops polling when connection is confirmed", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      mockGetTelegramStatus
        .mockResolvedValueOnce({
          isConnected: false,
          isEnabled: false,
          connectedAt: null,
        })
        .mockResolvedValue({
          isConnected: true,
          isEnabled: true,
          connectedAt: "2026-01-01",
        });
      mockRequestTelegramToken.mockResolvedValue({
        deepLink: "https://t.me/bot?start=abc",
      });
      vi.spyOn(window, "open").mockImplementation(() => null);

      const { act } = await import("@testing-library/react");

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} userId="0x123" />
      );

      // Flush the initial status fetch promise
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(
        screen.getByRole("button", { name: /Connect/i })
      ).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Connect/i }));
        await vi.advanceTimersByTimeAsync(0);
      });

      // Advance one poll interval (3_000ms) and flush the resulting promise
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_100);
      });

      expect(screen.getByText("Connected")).toBeInTheDocument();

      vi.useRealTimers();
    });
  });
});
