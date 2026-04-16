import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDropdownMenu } from "@/components/WalletManager/hooks/useDropdownMenu";

describe("useDropdownMenu", () => {
  it("should initialize with closed state", () => {
    const { result } = renderHook(() => useDropdownMenu());

    expect(result.current.openDropdown).toBeNull();
    expect(result.current.menuPosition).toBeNull();
  });

  it("should open dropdown and calculate position correctly (default bottom-left)", () => {
    const { result } = renderHook(() => useDropdownMenu());
    const mockButton = document.createElement("button");

    // Mock getBoundingClientRect
    // Button at (100, 100), size 50x30
    vi.spyOn(mockButton, "getBoundingClientRect").mockReturnValue({
      top: 100,
      left: 100,
      bottom: 130,
      right: 150,
      width: 50,
      height: 30,
      x: 100,
      y: 100,
      toJSON: () => {
        return;
      },
    } as DOMRect);

    // Mock window dimensions
    vi.stubGlobal("innerWidth", 1024);
    vi.stubGlobal("innerHeight", 768);

    act(() => {
      result.current.openDropdownMenu("wallet-1", mockButton);
    });

    expect(result.current.openDropdown).toBe("wallet-1");
    // Top = rect.bottom + 4 = 130 + 4 = 134
    // Left logic:
    // preferredLeft = rect.right - MENU_WIDTH (192) = 150 - 192 = -42
    // left = max(8, min(-42, 1024 - 192 - 8)) = 8
    expect(result.current.menuPosition).toEqual({ top: 134, left: 8 });
  });

  it("should calculating position correctly when opening upwards (near bottom edge)", () => {
    const { result } = renderHook(() => useDropdownMenu());
    const mockButton = document.createElement("button");

    // Button near bottom: window height 768, rect.bottom 700.
    // estimatedHeight = 210. 700 + 210 = 910 > 768 - 8 (760). So openUp = true.
    vi.spyOn(mockButton, "getBoundingClientRect").mockReturnValue({
      top: 670,
      left: 500,
      bottom: 700,
      right: 550,
      width: 50,
      height: 30,
      x: 500,
      y: 670,
      toJSON: () => {
        return;
      },
    } as DOMRect);

    vi.stubGlobal("innerWidth", 1024);
    vi.stubGlobal("innerHeight", 768);

    act(() => {
      result.current.openDropdownMenu("wallet-2", mockButton);
    });

    // openUp is true.
    // Top = max(8, rect.top - estimatedHeight - 4) = 670 - 210 - 4 = 456
    expect(result.current.menuPosition).toEqual({
      top: 456,
      // Left: rect.right (550) - 192 = 358. min(358, 1024-192-8=824) = 358. max(8,358) = 358.
      left: 358,
    });
  });

  it("should close dropdown when calling closeDropdown", () => {
    const { result } = renderHook(() => useDropdownMenu());
    const mockButton = document.createElement("button");
    vi.spyOn(mockButton, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => {
        return;
      },
    } as DOMRect);

    act(() => {
      result.current.openDropdownMenu("wallet-1", mockButton);
    });
    expect(result.current.openDropdown).toBe("wallet-1");

    act(() => {
      result.current.closeDropdown();
    });

    expect(result.current.openDropdown).toBeNull();
    expect(result.current.menuPosition).toBeNull();
  });

  it("should toggle dropdown (close if already open)", () => {
    const { result } = renderHook(() => useDropdownMenu());
    const mockButton = document.createElement("button");
    vi.spyOn(mockButton, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => {
        return;
      },
    } as DOMRect);

    // Open first
    act(() => {
      result.current.toggleDropdown("wallet-1", mockButton);
    });
    expect(result.current.openDropdown).toBe("wallet-1");

    // Toggle same wallet -> Close
    act(() => {
      result.current.toggleDropdown("wallet-1", mockButton);
    });
    expect(result.current.openDropdown).toBeNull();
  });

  it("should toggle dropdown (open new if different)", () => {
    const { result } = renderHook(() => useDropdownMenu());
    const mockButton = document.createElement("button");
    vi.spyOn(mockButton, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => {
        return;
      },
    } as DOMRect);

    // Open wallet-1
    act(() => {
      result.current.toggleDropdown("wallet-1", mockButton);
    });
    expect(result.current.openDropdown).toBe("wallet-1");

    // Toggle wallet-2 -> Open wallet-2 (replaces wallet-1)
    act(() => {
      result.current.toggleDropdown("wallet-2", mockButton);
    });
    expect(result.current.openDropdown).toBe("wallet-2");
  });

  it("should close dropdown when clicking outside", () => {
    const { result } = renderHook(() => useDropdownMenu());
    const mockButton = document.createElement("button");
    vi.spyOn(mockButton, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => {
        return;
      },
    } as DOMRect);

    act(() => {
      result.current.openDropdownMenu("wallet-1", mockButton);
    });
    expect(result.current.openDropdown).toBe("wallet-1");

    // Simulate click on document
    act(() => {
      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(result.current.openDropdown).toBeNull();
  });
});
