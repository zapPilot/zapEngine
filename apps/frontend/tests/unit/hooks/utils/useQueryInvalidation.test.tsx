import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { invalidateAndRefetch } from "@/hooks/utils/useQueryInvalidation";
import { walletLogger } from "@/utils/logger";

// Mock logger
vi.mock("@/utils/logger", () => ({
  walletLogger: {
    error: vi.fn(),
  },
}));

describe("useQueryInvalidation", () => {
  describe("invalidateAndRefetch", () => {
    it("should invalidate queries and refetch data successfully", async () => {
      const queryClient = new QueryClient();
      const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
      const refetch = vi.fn().mockResolvedValue("data");
      const queryKey = ["test-key"];

      await invalidateAndRefetch({
        queryClient,
        queryKey,
        refetch,
        operationName: "test-op",
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey });
      expect(refetch).toHaveBeenCalled();
      expect(walletLogger.error).not.toHaveBeenCalled();
    });

    it("should handle invalidation errors gracefully", async () => {
      const queryClient = new QueryClient();
      const error = new Error("Invalidation failed");
      for (const query of queryClient.getQueryCache().findAll()) {
        if (query.queryKey[0] === "wallet-portfolio") {
          query.setState({ status: "error", error: new Error("Test error") });
        }
      }
      vi.spyOn(queryClient, "invalidateQueries").mockRejectedValue(error);
      const refetch = vi.fn().mockResolvedValue("data");

      await invalidateAndRefetch({
        queryClient,
        queryKey: ["test"],
        refetch,
        operationName: "test-op",
      });

      expect(walletLogger.error).toHaveBeenCalledWith(
        "Failed to invalidate queries after test-op",
        error
      );
      expect(refetch).toHaveBeenCalled(); // Should still try to refetch
    });

    it("should handle refetch errors gracefully", async () => {
      const queryClient = new QueryClient();
      vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
      const error = new Error("Refetch failed");
      const refetch = vi.fn().mockRejectedValue(error);

      await invalidateAndRefetch({
        queryClient,
        queryKey: ["test"],
        refetch,
        operationName: "test-op",
      });

      expect(walletLogger.error).toHaveBeenCalledWith(
        "Failed to refetch data after test-op",
        error
      );
    });

    it("should use default operation name if not provided", async () => {
      const queryClient = new QueryClient();
      vi.spyOn(queryClient, "invalidateQueries").mockRejectedValue(
        new Error("Default op error")
      );
      const refetch = vi.fn();

      await invalidateAndRefetch({
        queryClient,
        queryKey: ["test"],
        refetch,
      });

      expect(walletLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("operation"),
        expect.any(Error)
      );
    });
  });
});
