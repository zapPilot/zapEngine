/**
 * Unit tests for modalHelpers
 */
import { describe, expect, it, vi } from "vitest";

import {
  buildFormActionsProps,
  buildModalFormState,
} from "@/components/wallet/portfolio/modals/utils/modalHelpers";

describe("modalHelpers", () => {
  describe("buildModalFormState", () => {
    it("should set amount to percentage of maxAmount", () => {
      const mockSetValue = vi.fn();
      const mockForm = {
        setValue: mockSetValue,
        formState: { isValid: true },
      } as any;

      const { handlePercentage } = buildModalFormState(mockForm, () => 100);
      handlePercentage(0.5);

      expect(mockSetValue).toHaveBeenCalledWith("amount", "50.0000", {
        shouldValidate: true,
      });
    });

    it("should handle 100% correctly", () => {
      const mockSetValue = vi.fn();
      const mockForm = {
        setValue: mockSetValue,
        formState: { isValid: true },
      } as any;

      const { handlePercentage } = buildModalFormState(mockForm, () => 500);
      handlePercentage(1);

      expect(mockSetValue).toHaveBeenCalledWith("amount", "500.0000", {
        shouldValidate: true,
      });
    });

    it("should handle 25% correctly", () => {
      const mockSetValue = vi.fn();
      const mockForm = {
        setValue: mockSetValue,
        formState: { isValid: true },
      } as any;

      const { handlePercentage } = buildModalFormState(mockForm, () => 200);
      handlePercentage(0.25);

      expect(mockSetValue).toHaveBeenCalledWith("amount", "50.0000", {
        shouldValidate: true,
      });
    });

    it("should not set value when maxAmount is 0", () => {
      const mockSetValue = vi.fn();
      const mockForm = {
        setValue: mockSetValue,
        formState: { isValid: true },
      } as any;

      const { handlePercentage } = buildModalFormState(mockForm, () => 0);
      handlePercentage(0.5);

      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it("should not set value when maxAmount is negative", () => {
      const mockSetValue = vi.fn();
      const mockForm = {
        setValue: mockSetValue,
        formState: { isValid: true },
      } as any;

      const { handlePercentage } = buildModalFormState(mockForm, () => -100);
      handlePercentage(0.5);

      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it("should expose isValid from form state", () => {
      const mockForm = {
        setValue: vi.fn(),
        formState: { isValid: false },
      } as any;

      const { isValid } = buildModalFormState(mockForm, () => 100);
      expect(isValid).toBe(false);
    });
  });

  describe("buildFormActionsProps", () => {
    it("should build props object with all required fields", () => {
      const mockForm = { control: {} } as any;
      const mockOnQuickSelect = vi.fn();
      const mockOnAction = vi.fn();

      const result = buildFormActionsProps(
        mockForm,
        "100",
        50.5,
        mockOnQuickSelect,
        "Deposit",
        false,
        "bg-gradient-btn",
        mockOnAction
      );

      expect(result).toEqual({
        form: mockForm,
        amount: "100",
        usdPrice: 50.5,
        onQuickSelect: mockOnQuickSelect,
        actionLabel: "Deposit",
        actionDisabled: false,
        actionGradient: "bg-gradient-btn",
        onAction: mockOnAction,
      });
    });

    it("should include amountClassName when provided", () => {
      const mockForm = { control: {} } as any;
      const mockOnQuickSelect = vi.fn();
      const mockOnAction = vi.fn();

      const result = buildFormActionsProps(
        mockForm,
        "50",
        25,
        mockOnQuickSelect,
        "Withdraw",
        true,
        "bg-red",
        mockOnAction,
        "custom-class"
      );

      expect(result.amountClassName).toBe("custom-class");
    });

    it("should not include amountClassName when not provided", () => {
      const mockForm = { control: {} } as any;
      const mockOnQuickSelect = vi.fn();
      const mockOnAction = vi.fn();

      const result = buildFormActionsProps(
        mockForm,
        "0",
        undefined,
        mockOnQuickSelect,
        "Submit",
        false,
        "bg-blue",
        mockOnAction
      );

      expect("amountClassName" in result).toBe(false);
    });

    it("should handle undefined usdPrice", () => {
      const mockForm = { control: {} } as any;
      const mockOnQuickSelect = vi.fn();
      const mockOnAction = vi.fn();

      const result = buildFormActionsProps(
        mockForm,
        "100",
        undefined,
        mockOnQuickSelect,
        "Action",
        false,
        "gradient",
        mockOnAction
      );

      expect(result.usdPrice).toBeUndefined();
    });
  });
});
