import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePortfolioModalState } from "../../../src/components/wallet/portfolio/hooks/usePortfolioModalState";

describe("usePortfolioModalState", () => {
  it("initializes with null activeModal and closed settings", () => {
    const { result } = renderHook(() => usePortfolioModalState());
    expect(result.current.activeModal).toBeNull();
    expect(result.current.isSettingsOpen).toBe(false);
  });

  it("opens a modal with a given type", () => {
    const { result } = renderHook(() => usePortfolioModalState());
    act(() => result.current.openModal("deposit"));
    expect(result.current.activeModal).toBe("deposit");
  });

  it("opens modal with null to clear", () => {
    const { result } = renderHook(() => usePortfolioModalState());
    act(() => result.current.openModal("withdraw"));
    act(() => result.current.openModal(null));
    expect(result.current.activeModal).toBeNull();
  });

  it("closes the modal", () => {
    const { result } = renderHook(() => usePortfolioModalState());
    act(() => result.current.openModal("deposit"));
    act(() => result.current.closeModal());
    expect(result.current.activeModal).toBeNull();
  });

  it("opens settings", () => {
    const { result } = renderHook(() => usePortfolioModalState());
    act(() => result.current.openSettings());
    expect(result.current.isSettingsOpen).toBe(true);
  });

  it("sets isSettingsOpen directly", () => {
    const { result } = renderHook(() => usePortfolioModalState());
    act(() => result.current.setIsSettingsOpen(true));
    expect(result.current.isSettingsOpen).toBe(true);
    act(() => result.current.setIsSettingsOpen(false));
    expect(result.current.isSettingsOpen).toBe(false);
  });
});
