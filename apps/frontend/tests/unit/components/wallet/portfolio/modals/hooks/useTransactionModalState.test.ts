import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTransactionDropdownState } from "@/components/wallet/portfolio/modals/hooks/useTransactionDropdownState";
import { useTransactionModalState } from "@/components/wallet/portfolio/modals/hooks/useTransactionModalState";
import { useWalletProvider } from "@/providers/WalletProvider";

vi.mock("@/providers/WalletProvider", () => ({
  useWalletProvider: vi.fn(),
}));

vi.mock(
  "@/components/wallet/portfolio/modals/hooks/useTransactionDropdownState",
  () => ({
    useTransactionDropdownState: vi.fn(),
  })
);

describe("useTransactionModalState", () => {
  const mockDropdownState = {
    dropdownRef: { current: null },
    isAssetDropdownOpen: false,
    isChainDropdownOpen: false,
    toggleAssetDropdown: vi.fn(),
    toggleChainDropdown: vi.fn(),
    closeDropdowns: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTransactionDropdownState).mockReturnValue(mockDropdownState);
  });

  it("returns dropdownState from useTransactionDropdownState", () => {
    vi.mocked(useWalletProvider).mockReturnValue({ isConnected: true });

    const { result } = renderHook(() => useTransactionModalState());

    expect(result.current.dropdownState).toBe(mockDropdownState);
    expect(useTransactionDropdownState).toHaveBeenCalledOnce();
  });

  it("returns isConnected: true when wallet is connected", () => {
    vi.mocked(useWalletProvider).mockReturnValue({ isConnected: true });

    const { result } = renderHook(() => useTransactionModalState());

    expect(result.current.isConnected).toBe(true);
    expect(useWalletProvider).toHaveBeenCalledOnce();
  });

  it("returns isConnected: false when wallet is disconnected", () => {
    vi.mocked(useWalletProvider).mockReturnValue({ isConnected: false });

    const { result } = renderHook(() => useTransactionModalState());

    expect(result.current.isConnected).toBe(false);
    expect(useWalletProvider).toHaveBeenCalledOnce();
  });

  it("returns correct type shape with dropdownState and isConnected", () => {
    vi.mocked(useWalletProvider).mockReturnValue({ isConnected: true });

    const { result } = renderHook(() => useTransactionModalState());

    // Verify structure
    expect(result.current).toEqual({
      dropdownState: mockDropdownState,
      isConnected: true,
    });

    // Verify dropdownState has all required properties
    expect(result.current.dropdownState).toHaveProperty("dropdownRef");
    expect(result.current.dropdownState).toHaveProperty("isAssetDropdownOpen");
    expect(result.current.dropdownState).toHaveProperty("isChainDropdownOpen");
    expect(result.current.dropdownState).toHaveProperty("toggleAssetDropdown");
    expect(result.current.dropdownState).toHaveProperty("toggleChainDropdown");
    expect(result.current.dropdownState).toHaveProperty("closeDropdowns");

    // Verify dropdownState methods are functions
    expect(typeof result.current.dropdownState.toggleAssetDropdown).toBe(
      "function"
    );
    expect(typeof result.current.dropdownState.toggleChainDropdown).toBe(
      "function"
    );
    expect(typeof result.current.dropdownState.closeDropdowns).toBe("function");
  });

  it("calls both hooks on each render", () => {
    vi.mocked(useWalletProvider).mockReturnValue({ isConnected: true });

    renderHook(() => useTransactionModalState());

    expect(useTransactionDropdownState).toHaveBeenCalledOnce();
    expect(useWalletProvider).toHaveBeenCalledOnce();
  });

  it("maintains referential integrity of dropdownState", () => {
    vi.mocked(useWalletProvider).mockReturnValue({ isConnected: true });

    const { result, rerender } = renderHook(() => useTransactionModalState());
    const firstDropdownState = result.current.dropdownState;

    rerender();
    const secondDropdownState = result.current.dropdownState;

    // dropdownState reference should be the same across re-renders
    // (since it's coming from the mocked hook)
    expect(firstDropdownState).toBe(secondDropdownState);
  });
});
