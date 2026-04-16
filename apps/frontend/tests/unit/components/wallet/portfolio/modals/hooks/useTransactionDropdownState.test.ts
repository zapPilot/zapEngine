import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useTransactionDropdownState } from "@/components/wallet/portfolio/modals/hooks/useTransactionDropdownState";

describe("useTransactionDropdownState", () => {
  it("initializes with both dropdowns closed", () => {
    const { result } = renderHook(() => useTransactionDropdownState());

    expect(result.current.isAssetDropdownOpen).toBe(false);
    expect(result.current.isChainDropdownOpen).toBe(false);
    expect(result.current.dropdownRef.current).toBeNull();
  });

  it("provides all required functions", () => {
    const { result } = renderHook(() => useTransactionDropdownState());

    expect(typeof result.current.toggleAssetDropdown).toBe("function");
    expect(typeof result.current.toggleChainDropdown).toBe("function");
    expect(typeof result.current.closeDropdowns).toBe("function");
  });

  describe("toggleAssetDropdown", () => {
    it("opens asset dropdown when closed", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      act(() => {
        result.current.toggleAssetDropdown();
      });

      expect(result.current.isAssetDropdownOpen).toBe(true);
      expect(result.current.isChainDropdownOpen).toBe(false);
    });

    it("closes asset dropdown when already open", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      act(() => {
        result.current.toggleAssetDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(true);

      act(() => {
        result.current.toggleAssetDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(false);
    });

    it("closes chain dropdown when opening asset dropdown", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      act(() => {
        result.current.toggleChainDropdown();
      });
      expect(result.current.isChainDropdownOpen).toBe(true);

      act(() => {
        result.current.toggleAssetDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(true);
      expect(result.current.isChainDropdownOpen).toBe(false);
    });
  });

  describe("toggleChainDropdown", () => {
    it("opens chain dropdown when closed", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      act(() => {
        result.current.toggleChainDropdown();
      });

      expect(result.current.isChainDropdownOpen).toBe(true);
      expect(result.current.isAssetDropdownOpen).toBe(false);
    });

    it("closes chain dropdown when already open", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      act(() => {
        result.current.toggleChainDropdown();
      });
      expect(result.current.isChainDropdownOpen).toBe(true);

      act(() => {
        result.current.toggleChainDropdown();
      });
      expect(result.current.isChainDropdownOpen).toBe(false);
    });

    it("closes asset dropdown when opening chain dropdown", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      act(() => {
        result.current.toggleAssetDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(true);

      act(() => {
        result.current.toggleChainDropdown();
      });
      expect(result.current.isChainDropdownOpen).toBe(true);
      expect(result.current.isAssetDropdownOpen).toBe(false);
    });
  });

  describe("mutual exclusion", () => {
    it("ensures only one dropdown can be open at a time", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      act(() => {
        result.current.toggleAssetDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(true);
      expect(result.current.isChainDropdownOpen).toBe(false);

      act(() => {
        result.current.toggleChainDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(false);
      expect(result.current.isChainDropdownOpen).toBe(true);

      act(() => {
        result.current.toggleAssetDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(true);
      expect(result.current.isChainDropdownOpen).toBe(false);
    });
  });

  describe("closeDropdowns", () => {
    it("closes both dropdowns when called", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      act(() => {
        result.current.toggleAssetDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(true);

      act(() => {
        result.current.closeDropdowns();
      });
      expect(result.current.isAssetDropdownOpen).toBe(false);
      expect(result.current.isChainDropdownOpen).toBe(false);
    });

    it("closes both dropdowns regardless of which was open", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      act(() => {
        result.current.toggleChainDropdown();
      });
      expect(result.current.isChainDropdownOpen).toBe(true);

      act(() => {
        result.current.closeDropdowns();
      });
      expect(result.current.isAssetDropdownOpen).toBe(false);
      expect(result.current.isChainDropdownOpen).toBe(false);
    });

    it("is safe to call when dropdowns are already closed", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      expect(result.current.isAssetDropdownOpen).toBe(false);
      expect(result.current.isChainDropdownOpen).toBe(false);

      act(() => {
        result.current.closeDropdowns();
      });

      expect(result.current.isAssetDropdownOpen).toBe(false);
      expect(result.current.isChainDropdownOpen).toBe(false);
    });
  });

  describe("click outside behavior", () => {
    it("closes dropdowns when clicking outside the ref element", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      const mockElement = document.createElement("div");
      Object.defineProperty(result.current.dropdownRef, "current", {
        writable: true,
        value: mockElement,
      });

      act(() => {
        result.current.toggleAssetDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(true);

      act(() => {
        const mouseEvent = new MouseEvent("mousedown", {
          bubbles: true,
        });
        document.dispatchEvent(mouseEvent);
      });

      expect(result.current.isAssetDropdownOpen).toBe(false);
      expect(result.current.isChainDropdownOpen).toBe(false);
    });

    it("closes chain dropdown when clicking outside", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      const mockElement = document.createElement("div");
      Object.defineProperty(result.current.dropdownRef, "current", {
        writable: true,
        value: mockElement,
      });

      act(() => {
        result.current.toggleChainDropdown();
      });
      expect(result.current.isChainDropdownOpen).toBe(true);

      act(() => {
        const mouseEvent = new MouseEvent("mousedown", {
          bubbles: true,
        });
        document.dispatchEvent(mouseEvent);
      });

      expect(result.current.isAssetDropdownOpen).toBe(false);
      expect(result.current.isChainDropdownOpen).toBe(false);
    });

    it("does not close dropdowns when clicking inside the ref element", () => {
      const { result } = renderHook(() => useTransactionDropdownState());

      const mockElement = document.createElement("div");
      Object.defineProperty(result.current.dropdownRef, "current", {
        writable: true,
        value: mockElement,
      });

      act(() => {
        result.current.toggleAssetDropdown();
      });
      expect(result.current.isAssetDropdownOpen).toBe(true);

      act(() => {
        const mouseEvent = new MouseEvent("mousedown", {
          bubbles: true,
        });
        Object.defineProperty(mouseEvent, "target", {
          writable: false,
          value: mockElement,
        });
        document.dispatchEvent(mouseEvent);
      });

      expect(result.current.isAssetDropdownOpen).toBe(true);
    });

    it("cleans up event listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
      const { result, unmount } = renderHook(() =>
        useTransactionDropdownState()
      );

      // Open a dropdown so useClickOutside registers its listeners
      act(() => {
        result.current.toggleAssetDropdown();
      });

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mousedown",
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });
  });

  describe("ref stability", () => {
    it("maintains the same ref object across re-renders", () => {
      const { result, rerender } = renderHook(() =>
        useTransactionDropdownState()
      );

      const initialRef = result.current.dropdownRef;

      rerender();

      expect(result.current.dropdownRef).toBe(initialRef);
    });
  });

  describe("function stability", () => {
    it("maintains stable function references across re-renders", () => {
      const { result, rerender } = renderHook(() =>
        useTransactionDropdownState()
      );

      const initialToggleAsset = result.current.toggleAssetDropdown;
      const initialToggleChain = result.current.toggleChainDropdown;
      const initialClose = result.current.closeDropdowns;

      rerender();

      expect(result.current.toggleAssetDropdown).toBe(initialToggleAsset);
      expect(result.current.toggleChainDropdown).toBe(initialToggleChain);
      expect(result.current.closeDropdowns).toBe(initialClose);
    });
  });
});
