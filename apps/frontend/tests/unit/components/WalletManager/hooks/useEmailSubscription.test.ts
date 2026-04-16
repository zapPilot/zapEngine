import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEmailSubscription } from "@/components/WalletManager/hooks/useEmailSubscription";
import {
  unsubscribeUserEmail,
  updateUserEmailSubscription,
} from "@/components/WalletManager/services/WalletService";
import { validateEmail } from "@/components/WalletManager/utils/validation";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/providers/ToastProvider";

// Mock dependencies
vi.mock("@/contexts/UserContext", () => ({
  useUser: vi.fn(),
}));

vi.mock("@/providers/ToastProvider", () => ({
  useToast: vi.fn(),
}));

vi.mock("@/components/WalletManager/services/WalletService", () => ({
  updateUserEmailSubscription: vi.fn(),
  unsubscribeUserEmail: vi.fn(),
}));

// Mock validation
vi.mock("@/components/WalletManager/utils/validation", () => ({
  validateEmail: vi.fn(),
}));

// Mock wallet error handler
vi.mock("@/lib/validation/walletUtils", () => ({
  handleWalletError: vi.fn((error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }
    return "An error occurred";
  }),
}));

// Create mock handlers that we can track
let mockSetLoading: ReturnType<typeof vi.fn>;
let mockSetSuccess: ReturnType<typeof vi.fn>;
let mockSetError: ReturnType<typeof vi.fn>;

// Mock useOperationStateHandlers
vi.mock("@/hooks/utils/useOperationState", () => ({
  useOperationStateHandlers: () => ({
    setLoading: mockSetLoading,
    setSuccess: mockSetSuccess,
    setError: mockSetError,
  }),
}));

describe("useEmailSubscription", () => {
  const mockShowToast = vi.fn();
  const mockOnEmailSubscribed = vi.fn();

  const defaultParams = {
    viewingUserId: "user-123",
    realUserId: "user-123",
    isOpen: true,
    onEmailSubscribed: mockOnEmailSubscribed,
  };

  beforeEach(() => {
    // Reset mock handlers
    mockSetLoading = vi.fn();
    mockSetSuccess = vi.fn();
    mockSetError = vi.fn();

    vi.clearAllMocks();
    vi.mocked(useUser).mockReturnValue({
      userInfo: { email: "" },
    } as any);
    vi.mocked(useToast).mockReturnValue({ showToast: mockShowToast } as any);

    // Default validation to pass
    vi.mocked(validateEmail).mockReturnValue({ isValid: true });
  });

  it("initializes with empty state", () => {
    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    expect(result.current.email).toBe("");
    expect(result.current.subscribedEmail).toBeNull();
    expect(result.current.isEditingSubscription).toBe(false);
  });

  it("initializes email from user context when modal opens", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: { email: "existing@example.com" },
    } as any);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    expect(result.current.subscribedEmail).toBe("existing@example.com");
    expect(result.current.email).toBe("existing@example.com");
    expect(mockOnEmailSubscribed).toHaveBeenCalled();
  });

  it("handleSubscribe fails with invalid email", async () => {
    vi.mocked(validateEmail).mockReturnValue({
      isValid: false,
      error: "Please enter a valid email address",
    });

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.setEmail("invalid");
    });

    await act(async () => {
      await result.current.handleSubscribe();
    });

    // Should not call API with invalid email
    expect(updateUserEmailSubscription).not.toHaveBeenCalled();
    expect(mockSetError).toHaveBeenCalledWith(
      "Please enter a valid email address"
    );
  });

  it("handleSubscribe succeeds with valid email", async () => {
    vi.mocked(updateUserEmailSubscription).mockResolvedValue(undefined);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.setEmail("valid@example.com");
    });

    await act(async () => {
      await result.current.handleSubscribe();
    });

    expect(updateUserEmailSubscription).toHaveBeenCalledWith(
      "user-123",
      "valid@example.com"
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );
  });

  it("handleUnsubscribe calls API and clears email", async () => {
    vi.mocked(unsubscribeUserEmail).mockResolvedValue(undefined);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    await act(async () => {
      await result.current.handleUnsubscribe();
    });

    expect(unsubscribeUserEmail).toHaveBeenCalledWith("user-123");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Unsubscribed" })
    );
  });

  it("startEditingSubscription sets editing state", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: { email: "test@example.com" },
    } as any);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.startEditingSubscription();
    });

    expect(result.current.isEditingSubscription).toBe(true);
    expect(result.current.email).toBe("test@example.com");
  });

  it("cancelEditingSubscription resets state", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: { email: "test@example.com" },
    } as any);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.startEditingSubscription();
      result.current.setEmail("changed@example.com");
    });

    act(() => {
      result.current.cancelEditingSubscription();
    });

    expect(result.current.isEditingSubscription).toBe(false);
    expect(result.current.email).toBe("test@example.com");
  });

  it("does not initialize email when modal is closed", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: { email: "existing@example.com" },
    } as any);

    renderHook(() => useEmailSubscription({ ...defaultParams, isOpen: false }));

    // Should not trigger initialization
    expect(mockOnEmailSubscribed).not.toHaveBeenCalled();
  });

  it("handleSubscribe fails when user not authenticated", async () => {
    const { result } = renderHook(() =>
      useEmailSubscription({ ...defaultParams, realUserId: "" })
    );

    act(() => {
      result.current.setEmail("valid@example.com");
    });

    await act(async () => {
      await result.current.handleSubscribe();
    });

    expect(updateUserEmailSubscription).not.toHaveBeenCalled();
    expect(mockSetError).toHaveBeenCalledWith("User not authenticated");
  });

  it("handleSubscribe displays validation error when email is empty", async () => {
    vi.mocked(validateEmail).mockReturnValue({
      isValid: false,
      error: "Email address is required",
    });

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.setEmail("");
    });

    await act(async () => {
      await result.current.handleSubscribe();
    });

    expect(mockSetError).toHaveBeenCalledWith("Email address is required");
  });

  it("handleSubscribe handles API error", async () => {
    vi.mocked(validateEmail).mockReturnValue({ isValid: true });

    const apiError = new Error("Network error");
    vi.mocked(updateUserEmailSubscription).mockRejectedValue(apiError);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.setEmail("valid@example.com");
    });

    await act(async () => {
      await result.current.handleSubscribe();
    });

    expect(mockSetError).toHaveBeenCalledWith("Network error");
  });

  it("handleUnsubscribe fails when user not authenticated", async () => {
    const { result } = renderHook(() =>
      useEmailSubscription({ ...defaultParams, realUserId: "" })
    );

    await act(async () => {
      await result.current.handleUnsubscribe();
    });

    expect(unsubscribeUserEmail).not.toHaveBeenCalled();
    expect(mockSetError).toHaveBeenCalledWith("User not authenticated");
  });

  it("handleUnsubscribe handles API error", async () => {
    const apiError = new Error("API failure");
    vi.mocked(unsubscribeUserEmail).mockRejectedValue(apiError);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    await act(async () => {
      await result.current.handleUnsubscribe();
    });

    expect(mockSetError).toHaveBeenCalledWith("API failure");
  });

  it("startEditingSubscription does not set email when no subscribedEmail", () => {
    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.startEditingSubscription();
    });

    expect(result.current.isEditingSubscription).toBe(true);
    expect(result.current.email).toBe("");
  });

  it("cancelEditingSubscription does not change email when no subscribedEmail", () => {
    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.setEmail("temp@example.com");
      result.current.cancelEditingSubscription();
    });

    expect(result.current.isEditingSubscription).toBe(false);
    expect(result.current.email).toBe("temp@example.com");
  });

  it("cancelEditingSubscription clears operation state", () => {
    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.cancelEditingSubscription();
    });

    expect(result.current.subscriptionOperation).toEqual({
      isLoading: false,
      error: null,
    });
  });

  it("onEmailSubscribed is optional and does not break when undefined", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: { email: "test@example.com" },
    } as any);

    const { result } = renderHook(() =>
      useEmailSubscription({ ...defaultParams, onEmailSubscribed: undefined })
    );

    // Should not throw when onEmailSubscribed is undefined
    expect(result.current.subscribedEmail).toBe("test@example.com");
  });

  it("handleSubscribe calls onEmailSubscribed callback on success", async () => {
    vi.mocked(validateEmail).mockReturnValue({ isValid: true });
    vi.mocked(updateUserEmailSubscription).mockResolvedValue(undefined);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.setEmail("new@example.com");
    });

    await act(async () => {
      await result.current.handleSubscribe();
    });

    expect(mockOnEmailSubscribed).toHaveBeenCalled();
    expect(result.current.isEditingSubscription).toBe(false);
  });

  it("handleSubscribe updates subscribedEmail on success", async () => {
    vi.mocked(validateEmail).mockReturnValue({ isValid: true });
    vi.mocked(updateUserEmailSubscription).mockResolvedValue(undefined);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    act(() => {
      result.current.setEmail("updated@example.com");
    });

    await act(async () => {
      await result.current.handleSubscribe();
    });

    expect(result.current.subscribedEmail).toBe("updated@example.com");
  });

  it("handleUnsubscribe clears email and subscribedEmail on success", async () => {
    vi.mocked(unsubscribeUserEmail).mockResolvedValue(undefined);
    vi.mocked(useUser).mockReturnValue({
      userInfo: { email: "old@example.com" },
    } as any);

    const { result } = renderHook(() => useEmailSubscription(defaultParams));

    // Initially has email from context
    expect(result.current.subscribedEmail).toBe("old@example.com");

    await act(async () => {
      await result.current.handleUnsubscribe();
    });

    expect(result.current.subscribedEmail).toBeNull();
    expect(result.current.email).toBe("");
    expect(result.current.isEditingSubscription).toBe(false);
  });
});
