import { beforeEach, describe, expect, it, vi } from "vitest";

import { httpUtils } from "@/lib/http";
import type {
  TelegramDisconnectResponse,
  TelegramStatus,
  TelegramTokenResponse,
} from "@/services/telegramService";
import * as telegramService from "@/services/telegramService";

// Mock HTTP utilities
vi.mock("@/lib/http", () => ({
  httpUtils: {
    accountApi: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    backendApi: {
      get: vi.fn(),
    },
  },
}));

describe("telegramService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requestTelegramToken", () => {
    it("should request telegram token successfully", async () => {
      const mockResponse: TelegramTokenResponse = {
        token: "123456",
        expiresAt: "2024-01-01T01:00:00Z",
        deepLink: "https://t.me/bot?start=123456",
      };

      vi.mocked(httpUtils.accountApi.post).mockResolvedValue(mockResponse);

      const result = await telegramService.requestTelegramToken("user123");

      expect(result).toEqual(mockResponse);
      expect(httpUtils.accountApi.post).toHaveBeenCalledWith(
        "/users/user123/telegram/request-token"
      );
    });

    it("should handle user not found (404)", async () => {
      const mockError = {
        status: 404,
        message: "User not found",
      };

      vi.mocked(httpUtils.accountApi.post).mockRejectedValue(mockError);

      await expect(
        telegramService.requestTelegramToken("nonexistent")
      ).rejects.toThrow();
    });

    it("should handle telegram already connected (409)", async () => {
      const mockError = {
        status: 409,
        message: "Telegram already connected",
      };

      vi.mocked(httpUtils.accountApi.post).mockRejectedValue(mockError);

      await expect(
        telegramService.requestTelegramToken("user123")
      ).rejects.toThrow();
    });

    it("should handle rate limiting (429)", async () => {
      const mockError = {
        status: 429,
        message: "Too many requests",
      };

      vi.mocked(httpUtils.accountApi.post).mockRejectedValue(mockError);

      await expect(
        telegramService.requestTelegramToken("user123")
      ).rejects.toThrow();
    });

    it("should handle network errors", async () => {
      const error = new Error("Network error");
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue(error);

      await expect(
        telegramService.requestTelegramToken("user123")
      ).rejects.toThrow();
    });

    it("should return token with correct format", async () => {
      const mockResponse: TelegramTokenResponse = {
        token: "987654",
        expiresAt: "2024-01-01T02:00:00Z",
        deepLink: "https://t.me/zapbot?start=987654",
      };

      vi.mocked(httpUtils.accountApi.post).mockResolvedValue(mockResponse);

      const result = await telegramService.requestTelegramToken("user456");

      expect(result.token).toHaveLength(6);
      expect(result.expiresAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
      );
      expect(result.deepLink).toContain("t.me");
    });
  });

  describe("getTelegramStatus", () => {
    it("should fetch telegram status successfully when connected", async () => {
      const mockStatus: TelegramStatus = {
        isConnected: true,
        chatId: "123456789",
        username: "testuser",
        connectedAt: "2024-01-01T00:00:00Z",
      };

      vi.mocked(httpUtils.accountApi.get).mockResolvedValue(mockStatus);

      const result = await telegramService.getTelegramStatus("user123");

      expect(result).toEqual(mockStatus);
      expect(httpUtils.accountApi.get).toHaveBeenCalledWith(
        "/users/user123/telegram/status"
      );
    });

    it("should fetch telegram status successfully when not connected", async () => {
      const mockStatus: TelegramStatus = {
        isConnected: false,
        chatId: null,
        username: null,
        connectedAt: null,
      };

      vi.mocked(httpUtils.accountApi.get).mockResolvedValue(mockStatus);

      const result = await telegramService.getTelegramStatus("user123");

      expect(result).toEqual(mockStatus);
      expect(result.isConnected).toBe(false);
      expect(result.chatId).toBeNull();
      expect(result.username).toBeNull();
      expect(result.connectedAt).toBeNull();
    });

    it("should handle user not found (404)", async () => {
      const mockError = {
        status: 404,
        message: "User not found",
      };

      vi.mocked(httpUtils.accountApi.get).mockRejectedValue(mockError);

      await expect(
        telegramService.getTelegramStatus("nonexistent")
      ).rejects.toThrow();
    });

    it("should handle network errors", async () => {
      const error = new Error("Network error");
      vi.mocked(httpUtils.accountApi.get).mockRejectedValue(error);

      await expect(
        telegramService.getTelegramStatus("user123")
      ).rejects.toThrow();
    });

    it("should return status with username when available", async () => {
      const mockStatus: TelegramStatus = {
        isConnected: true,
        chatId: "987654321",
        username: "john_doe",
        connectedAt: "2024-01-01T12:00:00Z",
      };

      vi.mocked(httpUtils.accountApi.get).mockResolvedValue(mockStatus);

      const result = await telegramService.getTelegramStatus("user456");

      expect(result.username).toBe("john_doe");
      expect(result.chatId).toBe("987654321");
    });
  });

  describe("disconnectTelegram", () => {
    it("should disconnect telegram successfully", async () => {
      const mockResponse: TelegramDisconnectResponse = {
        message: "Telegram account disconnected successfully",
      };

      vi.mocked(httpUtils.accountApi.delete).mockResolvedValue(mockResponse);

      const result = await telegramService.disconnectTelegram("user123");

      expect(result).toEqual(mockResponse);
      expect(httpUtils.accountApi.delete).toHaveBeenCalledWith(
        "/users/user123/telegram/disconnect"
      );
    });

    it("should handle user not found (404)", async () => {
      const mockError = {
        status: 404,
        message: "User not found",
      };

      vi.mocked(httpUtils.accountApi.delete).mockRejectedValue(mockError);

      await expect(
        telegramService.disconnectTelegram("nonexistent")
      ).rejects.toThrow();
    });

    it("should handle network errors", async () => {
      const error = new Error("Network error");
      vi.mocked(httpUtils.accountApi.delete).mockRejectedValue(error);

      await expect(
        telegramService.disconnectTelegram("user123")
      ).rejects.toThrow();
    });

    it("should return confirmation message", async () => {
      const mockResponse: TelegramDisconnectResponse = {
        message: "Successfully disconnected",
      };

      vi.mocked(httpUtils.accountApi.delete).mockResolvedValue(mockResponse);

      const result = await telegramService.disconnectTelegram("user456");

      expect(result.message).toBeTruthy();
      expect(typeof result.message).toBe("string");
    });
  });

  describe("Error handling with custom messages", () => {
    it("should transform 404 error to friendly message", async () => {
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue({
        status: 404,
        message: "User not found",
      });

      await expect(
        telegramService.requestTelegramToken("user123")
      ).rejects.toThrow("User not found. Please connect your wallet first.");
    });

    it("should transform 409 error to friendly message", async () => {
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue({
        status: 409,
        message: "Already connected",
      });

      await expect(
        telegramService.requestTelegramToken("user123")
      ).rejects.toThrow("Telegram account is already connected.");
    });

    it("should transform 410 error to friendly message", async () => {
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue({
        status: 410,
        message: "Token expired",
      });

      await expect(
        telegramService.requestTelegramToken("user123")
      ).rejects.toThrow(
        "Verification token has expired. Please request a new one."
      );
    });

    it("should transform 429 error to friendly message", async () => {
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue({
        status: 429,
        message: "Rate limit exceeded",
      });

      await expect(
        telegramService.requestTelegramToken("user123")
      ).rejects.toThrow("Too many requests. Please wait before trying again.");
    });

    it("should preserve default error message for other status codes", async () => {
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue({
        status: 500,
        message: "Internal server error",
      });

      await expect(
        telegramService.requestTelegramToken("user123")
      ).rejects.toThrow("Internal server error");
    });

    it("should handle non-object errors", async () => {
      vi.mocked(httpUtils.accountApi.get).mockRejectedValue(
        "Just a string error"
      );

      try {
        await telegramService.getTelegramStatus("user123");
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.message).toBe("Telegram service error");
        expect(e.status).toBe(500);
      }
    });
  });
});
