import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TIMINGS } from "@/constants/timings";
import { useWalletList } from "@/hooks/wallet/useWalletList";
import type { WalletData } from "@/lib/validation/walletUtils";

import { act, renderHook, waitFor } from "../../../test-utils";

vi.mock("@/components/WalletManager/services/WalletService", () => ({
  loadWallets: vi.fn(),
}));

const { loadWallets: mockLoadWallets } =
  await import("@/components/WalletManager/services/WalletService");

const MOCK_WALLETS = [
  { address: "0xABC123", label: "Main", isActive: false },
  { address: "0xDEF456", label: "Trading", isActive: false },
] as unknown as WalletData[];

const DEFAULT_PARAMS = {
  userId: "user-123" as string | null | undefined,
  connectedWallets: [{ address: "0xabc123", isActive: true }],
  isOpen: true,
  isOwner: true,
};

function renderUseWalletList(overrides: Partial<typeof DEFAULT_PARAMS> = {}) {
  const props = { ...DEFAULT_PARAMS, ...overrides };
  return renderHook(() => useWalletList(props));
}

describe("useWalletList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockLoadWallets).mockResolvedValue(MOCK_WALLETS);
  });

  describe("Initial state", () => {
    it("returns empty wallets array and isRefreshing=false initially", () => {
      const { result } = renderUseWalletList({ isOpen: false });

      expect(result.current.wallets).toEqual([]);
      expect(result.current.isRefreshing).toBe(false);
    });
  });

  describe("loadWallets function", () => {
    it("does not fetch when userId is null", async () => {
      const { result } = renderUseWalletList({
        userId: null,
        isOpen: false,
      });

      await act(async () => {
        await result.current.loadWallets();
      });

      expect(mockLoadWallets).not.toHaveBeenCalled();
    });

    it("fetches wallets and maps active state from connectedWallets", async () => {
      const { result } = renderUseWalletList({ isOpen: false });

      await act(async () => {
        await result.current.loadWallets();
      });

      expect(mockLoadWallets).toHaveBeenCalledWith("user-123");
      expect(result.current.wallets).toEqual([
        { address: "0xABC123", label: "Main", isActive: true },
        { address: "0xDEF456", label: "Trading", isActive: false },
      ]);
    });

    it("sets isRefreshing=true during non-silent load", async () => {
      let resolvePromise: (value: WalletData[]) => void;
      const deferredPromise = new Promise<WalletData[]>(resolve => {
        resolvePromise = resolve;
      });
      vi.mocked(mockLoadWallets).mockReturnValue(deferredPromise);

      const { result } = renderUseWalletList({ isOpen: false });

      act(() => {
        void result.current.loadWallets();
      });

      expect(result.current.isRefreshing).toBe(true);

      await act(async () => {
        resolvePromise!(MOCK_WALLETS);
        await deferredPromise;
      });

      expect(result.current.isRefreshing).toBe(false);
    });

    it("does not set isRefreshing during silent load", async () => {
      const { result } = renderUseWalletList({ isOpen: false });

      await act(async () => {
        await result.current.loadWallets(true);
      });

      expect(result.current.isRefreshing).toBe(false);
    });

    it("handles fetch error gracefully", async () => {
      vi.mocked(mockLoadWallets).mockRejectedValue(new Error("Fetch failed"));

      const { result } = renderUseWalletList({ isOpen: false });

      await act(async () => {
        await result.current.loadWallets();
      });

      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.wallets).toEqual([]);
    });
  });

  describe("isWalletActive logic", () => {
    it("marks wallet as inactive when connectedWallet.isActive=false", async () => {
      const { result } = renderUseWalletList({
        connectedWallets: [{ address: "0xabc123", isActive: false }],
        isOpen: false,
      });

      await act(async () => {
        await result.current.loadWallets();
      });

      expect(result.current.wallets[0].isActive).toBe(false);
    });

    it("performs case-insensitive address comparison", async () => {
      const { result } = renderUseWalletList({
        connectedWallets: [{ address: "0xABC123", isActive: true }],
        isOpen: false,
      });

      await act(async () => {
        await result.current.loadWallets();
      });

      const mainWallet = result.current.wallets.find(
        (w: WalletData) => w.address === "0xABC123"
      );
      expect(mainWallet?.isActive).toBe(true);
    });
  });

  describe("Auto-load on open", () => {
    it("loads wallets when isOpen becomes true with userId", async () => {
      renderUseWalletList();

      await waitFor(() => {
        expect(mockLoadWallets).toHaveBeenCalledWith("user-123");
      });
    });

    it("does not load when isOpen is false", () => {
      renderUseWalletList({ isOpen: false });

      expect(mockLoadWallets).not.toHaveBeenCalled();
    });
  });

  describe("Periodic refresh", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sets up interval when isOpen + userId + isOwner all true", async () => {
      renderUseWalletList();

      // Flush the initial auto-load effect promise
      await act(async () => {
        /* let pending promises resolve */
      });

      expect(mockLoadWallets).toHaveBeenCalledTimes(1);
      vi.mocked(mockLoadWallets).mockClear();

      await act(async () => {
        vi.advanceTimersByTime(TIMINGS.WALLET_REFRESH_INTERVAL);
      });

      expect(mockLoadWallets).toHaveBeenCalledWith("user-123");
    });

    it("does not set up interval when isOwner=false", async () => {
      renderUseWalletList({ isOwner: false });

      await act(async () => {
        /* let pending promises resolve */
      });

      expect(mockLoadWallets).toHaveBeenCalledTimes(1);
      vi.mocked(mockLoadWallets).mockClear();

      await act(async () => {
        vi.advanceTimersByTime(TIMINGS.WALLET_REFRESH_INTERVAL);
      });

      expect(mockLoadWallets).not.toHaveBeenCalled();
    });

    it("does not set up interval when isOpen=false", async () => {
      renderUseWalletList({ isOpen: false });

      expect(mockLoadWallets).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(TIMINGS.WALLET_REFRESH_INTERVAL);
      });

      expect(mockLoadWallets).not.toHaveBeenCalled();
    });

    it("does not set up interval when userId is null", async () => {
      renderUseWalletList({ userId: null });

      expect(mockLoadWallets).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(TIMINGS.WALLET_REFRESH_INTERVAL);
      });

      expect(mockLoadWallets).not.toHaveBeenCalled();
    });

    it("clears interval on unmount", async () => {
      const { unmount } = renderUseWalletList();

      await act(async () => {
        /* let pending promises resolve */
      });

      expect(mockLoadWallets).toHaveBeenCalledTimes(1);
      vi.mocked(mockLoadWallets).mockClear();

      unmount();

      await act(async () => {
        vi.advanceTimersByTime(TIMINGS.WALLET_REFRESH_INTERVAL);
      });

      expect(mockLoadWallets).not.toHaveBeenCalled();
    });
  });
});
