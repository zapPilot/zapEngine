import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useTransactionForm } from "@/components/wallet/portfolio/modals/hooks/useTransactionForm";

describe("useTransactionForm", () => {
  it("initializes with default values", () => {
    const { result } = renderHook(() => useTransactionForm());
    expect(result.current.getValues()).toEqual(
      expect.objectContaining({
        chainId: 1,
        tokenAddress: "",
        amount: "",
        slippage: 0.5,
        intensity: 50,
      })
    );
  });

  it("initializes with provided default values", () => {
    const { result } = renderHook(() =>
      useTransactionForm({
        amount: "100",
        tokenAddress: "0x123",
      })
    );
    expect(result.current.getValues()).toEqual(
      expect.objectContaining({
        amount: "100",
        tokenAddress: "0x123",
      })
    );
  });

  it("validates valid input", async () => {
    const { result } = renderHook(() => useTransactionForm());

    await act(async () => {
      result.current.setValue("chainId", 1);
      result.current.setValue("tokenAddress", "0x1234");
      result.current.setValue("amount", "10");
    });

    let valid;
    await act(async () => {
      valid = await result.current.trigger();
    });

    expect(valid).toBe(true);
    expect(result.current.formState.errors).toEqual({});
  });

  it.skip("validates invalid amount", async () => {
    const { result } = renderHook(() => useTransactionForm());

    await act(async () => {
      result.current.setValue("amount", "0");
    });

    let valid;
    await act(async () => {
      valid = await result.current.trigger("amount");
    });
    expect(valid).toBe(false);
    await waitFor(() => {
      expect(result.current.formState.errors.amount).toBeDefined();
    });

    await act(async () => {
      result.current.setValue("amount", "abc");
    });

    await act(async () => {
      valid = await result.current.trigger("amount");
    });
    expect(valid).toBe(false);
    await waitFor(() => {
      expect(result.current.formState.errors.amount).toBeDefined();
    });
  });

  it.skip("validates invalid token address", async () => {
    const { result } = renderHook(() => useTransactionForm());

    await act(async () => {
      result.current.setValue("tokenAddress", "123");
    });

    let valid;
    await act(async () => {
      valid = await result.current.trigger("tokenAddress");
    });
    expect(valid).toBe(false);
    await waitFor(() => {
      expect(result.current.formState.errors.tokenAddress).toBeDefined();
    });
  });
});
