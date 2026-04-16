import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserProvider, useUser } from "../../../src/contexts/UserContext";
import { useCurrentUser } from "../../../src/hooks/queries/wallet/useUserQuery";
import { logger } from "../../../src/utils/logger";
import { render, screen, waitFor } from "../../test-utils";

// UNMOCK the global mock from setup.ts by importing actual
// We use the alias path because that's likely how setup.ts mocked it
vi.mock("@/contexts/UserContext", async () => {
  return await vi.importActual("../../../src/contexts/UserContext");
});

// Mock dependencies
vi.mock("../../../src/hooks/queries/wallet/useUserQuery", () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

function TestComponent() {
  const { userInfo, loading, error, isConnected, triggerRefetch } = useUser();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="error">{String(error || "no-error")}</div>
      <div data-testid="connected">{String(isConnected)}</div>
      <div data-testid="email">{userInfo?.email || "no-email"}</div>
      <button
        onClick={() => {
          if (triggerRefetch) triggerRefetch();
        }}
      >
        Refetch
      </button>
    </div>
  );
}

describe("UserContext", () => {
  const mockRefetch = vi.fn();
  const defaultUserQueryState = {
    userInfo: null,
    isLoading: false,
    error: null,
    isConnected: false,
    connectedWallet: null,
    refetch: mockRefetch,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCurrentUser).mockReturnValue(defaultUserQueryState);
  });

  it("should provide values to consumers", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      ...defaultUserQueryState,
      userInfo: { email: "test@example.com" } as any,
      isConnected: true,
    });

    render(
      <UserProvider>
        <TestComponent />
      </UserProvider>
    );

    expect(screen.getByTestId("email")).toHaveTextContent("test@example.com");
    expect(screen.getByTestId("connected")).toHaveTextContent("true");
  });

  it("should throw error if used outside provider", () => {
    // Suppress console.error (React error boundary logging)
    const spy = vi.spyOn(console, "error").mockImplementation(() => {
      /* noop - suppress React error boundary logging */
    });

    expect(() => render(<TestComponent />)).toThrow(
      "useUser must be used within a UserProvider"
    );

    spy.mockRestore();
  });

  it("should handle refetch trigger", async () => {
    mockRefetch.mockResolvedValue("done");

    render(
      <UserProvider>
        <TestComponent />
      </UserProvider>
    );

    const button = screen.getByText("Refetch");
    await userEvent.click(button);

    expect(mockRefetch).toHaveBeenCalled();
  });

  it("should log error if refetch fails", async () => {
    const error = new Error("Refetch failed");
    mockRefetch.mockRejectedValue(error);

    render(
      <UserProvider>
        <TestComponent />
      </UserProvider>
    );

    const button = screen.getByText("Refetch");
    await userEvent.click(button);

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to refetch user data",
        error
      );
    });
  });
});
