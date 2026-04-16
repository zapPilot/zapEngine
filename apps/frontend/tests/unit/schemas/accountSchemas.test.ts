import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  accountTokenSchema,
  addWalletResponseSchema,
  connectWalletResponseSchema,
  etlJobStatusResponseSchema,
  healthCheckResponseSchema,
  messageResponseSchema,
  planSchema,
  updateEmailResponseSchema,
  userCryptoWalletSchema,
  userProfileResponseSchema,
  userSchema,
  userSubscriptionSchema,
  validateAccountTokens,
  validateAddWalletResponse,
  validateConnectWalletResponse,
  validateHealthCheckResponse,
  validateMessageResponse,
  validateUpdateEmailResponse,
  validateUserProfileResponse,
  validateUserWallets,
} from "@/schemas/api/accountSchemas";

describe("accountSchemas", () => {
  describe("userSchema", () => {
    it("validates correct user data", () => {
      const validData = {
        id: "user123",
        email: "user@example.com",
        is_active: true,
        is_subscribed_to_reports: false,
        created_at: "2025-01-17T00:00:00Z",
      };

      expect(() => userSchema.parse(validData)).not.toThrow();
    });

    it("accepts user without email", () => {
      const validData = {
        id: "user123",
        is_active: true,
        is_subscribed_to_reports: false,
        created_at: "2025-01-17T00:00:00Z",
      };

      expect(() => userSchema.parse(validData)).not.toThrow();
    });

    it("rejects invalid email", () => {
      const invalidData = {
        id: "user123",
        email: "not-an-email",
        is_active: true,
        is_subscribed_to_reports: false,
        created_at: "2025-01-17T00:00:00Z",
      };

      expect(() => userSchema.parse(invalidData)).toThrow(ZodError);
    });

    it("rejects missing required fields", () => {
      const invalidData = {
        id: "user123",
        email: "user@example.com",
      };

      expect(() => userSchema.parse(invalidData)).toThrow(ZodError);
    });
  });

  describe("userCryptoWalletSchema", () => {
    it("validates correct wallet data", () => {
      const validData = {
        id: "wallet123",
        user_id: "user123",
        wallet: "0x1234567890123456789012345678901234567890",
        label: "My Main Wallet",
        created_at: "2025-01-17T00:00:00Z",
      };

      expect(() => userCryptoWalletSchema.parse(validData)).not.toThrow();
    });

    it("accepts wallet without label", () => {
      const validData = {
        id: "wallet123",
        user_id: "user123",
        wallet: "0x1234567890123456789012345678901234567890",
        created_at: "2025-01-17T00:00:00Z",
      };

      expect(() => userCryptoWalletSchema.parse(validData)).not.toThrow();
    });

    it("accepts wallet with null label (backend occasionally returns null)", () => {
      const validData = {
        id: "wallet123",
        user_id: "user123",
        wallet: "0x1234567890123456789012345678901234567890",
        label: null,
        created_at: "2025-01-17T00:00:00Z",
      };

      expect(() => userCryptoWalletSchema.parse(validData)).not.toThrow();
    });
  });

  describe("planSchema", () => {
    it("validates correct plan data", () => {
      const validData = {
        code: "premium",
        name: "Premium Plan",
        tier: 2,
      };

      expect(() => planSchema.parse(validData)).not.toThrow();
    });
  });

  describe("userSubscriptionSchema", () => {
    it("validates correct subscription data with plan", () => {
      const validData = {
        id: "sub123",
        user_id: "user123",
        plan_code: "premium",
        starts_at: "2025-01-01T00:00:00Z",
        ends_at: "2026-01-01T00:00:00Z",
        is_canceled: false,
        created_at: "2025-01-17T00:00:00Z",
        plan: {
          code: "premium",
          name: "Premium Plan",
          tier: 2,
        },
      };

      expect(() => userSubscriptionSchema.parse(validData)).not.toThrow();
    });

    it("accepts subscription without end date", () => {
      const validData = {
        id: "sub123",
        user_id: "user123",
        plan_code: "premium",
        starts_at: "2025-01-01T00:00:00Z",
        is_canceled: false,
        created_at: "2025-01-17T00:00:00Z",
      };

      expect(() => userSubscriptionSchema.parse(validData)).not.toThrow();
    });

    it("accepts subscription without plan details", () => {
      const validData = {
        id: "sub123",
        user_id: "user123",
        plan_code: "premium",
        starts_at: "2025-01-01T00:00:00Z",
        is_canceled: false,
        created_at: "2025-01-17T00:00:00Z",
      };

      expect(() => userSubscriptionSchema.parse(validData)).not.toThrow();
    });

    it("accepts subscription with null ends_at", () => {
      const validData = {
        id: "sub123",
        user_id: "user123",
        plan_code: "premium",
        starts_at: "2025-01-01T00:00:00Z",
        ends_at: null,
        is_canceled: false,
        created_at: "2025-01-17T00:00:00Z",
      };

      expect(() => userSubscriptionSchema.parse(validData)).not.toThrow();
    });
  });

  describe("connectWalletResponseSchema", () => {
    it("validates correct connect wallet response", () => {
      const validData = {
        user_id: "user123",
        is_new_user: true,
      };

      expect(() => connectWalletResponseSchema.parse(validData)).not.toThrow();
    });

    it("accepts existing user response", () => {
      const validData = {
        user_id: "user123",
        is_new_user: false,
      };

      expect(() => connectWalletResponseSchema.parse(validData)).not.toThrow();
    });
  });

  /**
   * Comprehensive test suite for ETL job status schema with snake_case fields
   * These tests prevent regression of the bug where preprocessing dropped message/rate_limited fields
   */
  describe("etlJobStatusResponseSchema - snake_case acceptance", () => {
    it("should accept minimal API response with only job_id and status", () => {
      const minimalResponse = {
        job_id: "etl_1767881497530_1rw7jo",
        status: "pending",
        // No trigger, created_at, message, etc.
      };

      const result = etlJobStatusResponseSchema.parse(minimalResponse);

      expect(result.job_id).toBe("etl_1767881497530_1rw7jo");
      expect(result.status).toBe("pending");
      expect(result.trigger).toBeUndefined();
      expect(result.created_at).toBeUndefined();
      expect(result.message).toBeUndefined();
    });

    it("should accept full real API response from connect-wallet endpoint", () => {
      // Real API response structure
      const realApiResponse = {
        job_id: "etl_1767881497530_1rw7jo",
        status: "pending",
        message: "Wallet data fetch job queued successfully",
        rate_limited: false,
      };

      const result = etlJobStatusResponseSchema.parse(realApiResponse);

      expect(result.job_id).toBe("etl_1767881497530_1rw7jo");
      expect(result.status).toBe("pending");
      expect(result.message).toBe("Wallet data fetch job queued successfully");
      expect(result.rate_limited).toBe(false);
    });

    it("should accept response with all optional fields", () => {
      const fullResponse = {
        job_id: "test-123",
        status: "completed",
        trigger: "webhook",
        created_at: "2026-01-08T00:00:00Z",
        updated_at: "2026-01-08T01:00:00Z",
        completed_at: "2026-01-08T02:00:00Z",
        records_processed: 100,
        records_inserted: 95,
        duration: 3600,
        message: "Job completed successfully",
        rate_limited: false,
      };

      const result = etlJobStatusResponseSchema.parse(fullResponse);

      expect(result.job_id).toBe("test-123");
      expect(result.status).toBe("completed");
      expect(result.trigger).toBe("webhook");
      expect(result.created_at).toBe("2026-01-08T00:00:00Z");
      expect(result.records_processed).toBe(100);
      expect(result.message).toBe("Job completed successfully");
      expect(result.rate_limited).toBe(false);
    });

    it("should handle partial responses with some optional fields", () => {
      const partialResponse = {
        job_id: "partial-123",
        status: "processing",
        created_at: "2024-01-01T00:00:00Z",
        message: "Processing...",
        // No trigger, updated_at, records_processed, etc.
      };

      const result = etlJobStatusResponseSchema.parse(partialResponse);

      expect(result.job_id).toBe("partial-123");
      expect(result.status).toBe("processing");
      expect(result.created_at).toBe("2024-01-01T00:00:00Z");
      expect(result.message).toBe("Processing...");
      expect(result.trigger).toBeUndefined();
      expect(result.records_processed).toBeUndefined();
    });

    it("should reject response missing required job_id field", () => {
      const missingJobId = {
        status: "pending",
        message: "Test",
      };

      expect(() => etlJobStatusResponseSchema.parse(missingJobId)).toThrow(
        ZodError
      );
    });

    it("should reject response missing required status field", () => {
      const missingStatus = {
        job_id: "test-123",
        message: "Test",
      };

      expect(() => etlJobStatusResponseSchema.parse(missingStatus)).toThrow(
        ZodError
      );
    });

    it("should handle extra fields not in schema due to passthrough", () => {
      const responseWithExtraFields = {
        job_id: "test-123",
        status: "pending",
        custom_field: "custom_value",
        future_api_field: 42,
      };

      // Should not throw - passthrough allows extra fields
      const result = etlJobStatusResponseSchema.parse(responseWithExtraFields);

      expect(result.job_id).toBe("test-123");
      expect(result.status).toBe("pending");
      expect(() =>
        etlJobStatusResponseSchema.parse(responseWithExtraFields)
      ).not.toThrow();
    });
  });

  describe("addWalletResponseSchema", () => {
    it("validates correct add wallet response", () => {
      const validData = {
        wallet_id: "wallet123",
        message: "Wallet added successfully",
      };

      expect(() => addWalletResponseSchema.parse(validData)).not.toThrow();
    });
  });

  describe("updateEmailResponseSchema", () => {
    it("validates correct update email response", () => {
      const validData = {
        success: true,
        message: "Email updated successfully",
      };

      expect(() => updateEmailResponseSchema.parse(validData)).not.toThrow();
    });

    it("accepts failure response", () => {
      const validData = {
        success: false,
        message: "Email update failed",
      };

      expect(() => updateEmailResponseSchema.parse(validData)).not.toThrow();
    });
  });

  describe("userProfileResponseSchema", () => {
    it("validates correct user profile response", () => {
      const validData = {
        user: {
          id: "user123",
          email: "user@example.com",
          is_active: true,
          is_subscribed_to_reports: false,
          created_at: "2025-01-17T00:00:00Z",
        },
        wallets: [
          {
            id: "wallet123",
            user_id: "user123",
            wallet: "0x1234567890123456789012345678901234567890",
            label: "Main Wallet",
            created_at: "2025-01-17T00:00:00Z",
          },
        ],
        subscription: {
          id: "sub123",
          user_id: "user123",
          plan_code: "premium",
          starts_at: "2025-01-01T00:00:00Z",
          is_canceled: false,
          created_at: "2025-01-17T00:00:00Z",
          plan: {
            code: "premium",
            name: "Premium Plan",
            tier: 2,
          },
        },
      };

      expect(() => userProfileResponseSchema.parse(validData)).not.toThrow();
    });

    it("accepts profile without subscription", () => {
      const validData = {
        user: {
          id: "user123",
          email: "user@example.com",
          is_active: true,
          is_subscribed_to_reports: false,
          created_at: "2025-01-17T00:00:00Z",
        },
        wallets: [],
      };

      expect(() => userProfileResponseSchema.parse(validData)).not.toThrow();
    });

    it("accepts profile with empty wallets array", () => {
      const validData = {
        user: {
          id: "user123",
          is_active: true,
          is_subscribed_to_reports: false,
          created_at: "2025-01-17T00:00:00Z",
        },
        wallets: [],
      };

      expect(() => userProfileResponseSchema.parse(validData)).not.toThrow();
    });

    it("accepts profile when wallet labels and subscription end dates are null", () => {
      const validData = {
        user: {
          id: "user123",
          is_active: true,
          is_subscribed_to_reports: false,
          created_at: "2025-01-17T00:00:00Z",
        },
        wallets: [
          {
            id: "wallet123",
            user_id: "user123",
            wallet: "0x1234567890123456789012345678901234567890",
            label: null,
            created_at: "2025-01-17T00:00:00Z",
          },
        ],
        subscription: {
          id: "sub123",
          user_id: "user123",
          plan_code: "premium",
          starts_at: "2025-01-01T00:00:00Z",
          ends_at: null,
          is_canceled: false,
          created_at: "2025-01-17T00:00:00Z",
        },
      };

      expect(() => userProfileResponseSchema.parse(validData)).not.toThrow();
    });
  });

  describe("accountTokenSchema", () => {
    it("validates correct account token data", () => {
      const validData = {
        id: "token123",
        chain: "ethereum",
        name: "USD Coin",
        symbol: "USDC",
        display_symbol: "USDC",
        optimized_symbol: "USDC",
        decimals: 6,
        logo_url: "https://example.com/usdc.png",
        protocol_id: "protocol123",
        price: 1.0,
        is_verified: true,
        is_core: true,
        is_wallet: false,
        time_at: 1705449600,
        amount: 1000.5,
      };

      expect(() => accountTokenSchema.parse(validData)).not.toThrow();
    });
  });

  describe("healthCheckResponseSchema", () => {
    it("validates correct health check response", () => {
      const validData = {
        status: "healthy",
        timestamp: "2025-01-17T00:00:00Z",
      };

      expect(() => healthCheckResponseSchema.parse(validData)).not.toThrow();
    });
  });

  describe("messageResponseSchema", () => {
    it("validates correct message response", () => {
      const validData = {
        message: "Operation completed successfully",
      };

      expect(() => messageResponseSchema.parse(validData)).not.toThrow();
    });
  });

  describe("validation helper functions", () => {
    describe("validateConnectWalletResponse", () => {
      it("returns validated data for valid input", () => {
        const validData = {
          user_id: "user123",
          is_new_user: true,
        };

        const result = validateConnectWalletResponse(validData);
        expect(result).toEqual(validData);
      });

      it("throws ZodError for invalid input", () => {
        const invalidData = {
          user_id: "user123",
        };

        expect(() => validateConnectWalletResponse(invalidData)).toThrow(
          ZodError
        );
      });
    });

    describe("validateAddWalletResponse", () => {
      it("returns validated data for valid input", () => {
        const validData = {
          wallet_id: "wallet123",
          message: "Wallet added successfully",
        };

        const result = validateAddWalletResponse(validData);
        expect(result.wallet_id).toBe("wallet123");
      });

      it("throws ZodError for invalid input", () => {
        const invalidData = {
          wallet_id: 123,
          message: "Wallet added successfully",
        };

        expect(() => validateAddWalletResponse(invalidData)).toThrow(ZodError);
      });
    });

    describe("validateUpdateEmailResponse", () => {
      it("returns validated data for valid input", () => {
        const validData = {
          success: true,
          message: "Email updated successfully",
        };

        const result = validateUpdateEmailResponse(validData);
        expect(result.success).toBe(true);
      });

      it("throws ZodError for invalid input", () => {
        const invalidData = {
          success: "true",
          message: "Email updated successfully",
        };

        expect(() => validateUpdateEmailResponse(invalidData)).toThrow(
          ZodError
        );
      });
    });

    describe("validateUserProfileResponse", () => {
      it("returns validated data for valid input", () => {
        const validData = {
          user: {
            id: "user123",
            is_active: true,
            is_subscribed_to_reports: false,
            created_at: "2025-01-17T00:00:00Z",
          },
          wallets: [],
        };

        const result = validateUserProfileResponse(validData);
        expect(result.user.id).toBe("user123");
      });

      it("throws ZodError for missing required fields", () => {
        const invalidData = {
          user: {
            id: "user123",
          },
          wallets: [],
        };

        expect(() => validateUserProfileResponse(invalidData)).toThrow(
          ZodError
        );
      });
    });

    describe("validateAccountTokens", () => {
      it("validates array of account tokens", () => {
        const validData = [
          {
            id: "token123",
            chain: "ethereum",
            name: "USD Coin",
            symbol: "USDC",
            display_symbol: "USDC",
            optimized_symbol: "USDC",
            decimals: 6,
            logo_url: "https://example.com/usdc.png",
            protocol_id: "protocol123",
            price: 1.0,
            is_verified: true,
            is_core: true,
            is_wallet: false,
            time_at: 1705449600,
            amount: 1000.5,
          },
        ];

        const result = validateAccountTokens(validData);
        expect(result).toHaveLength(1);
      });

      it("accepts empty array", () => {
        const validData: unknown[] = [];

        const result = validateAccountTokens(validData);
        expect(result).toHaveLength(0);
      });

      it("throws ZodError for invalid token in array", () => {
        const invalidData = [
          {
            id: "token123",
            chain: "ethereum",
            // missing required fields
          },
        ];

        expect(() => validateAccountTokens(invalidData)).toThrow(ZodError);
      });
    });

    describe("validateUserWallets", () => {
      it("validates array of user wallets", () => {
        const validData = [
          {
            id: "wallet123",
            user_id: "user123",
            wallet: "0x1234567890123456789012345678901234567890",
            created_at: "2025-01-17T00:00:00Z",
          },
        ];

        const result = validateUserWallets(validData);
        expect(result).toHaveLength(1);
      });

      it("accepts empty array", () => {
        const validData: unknown[] = [];

        const result = validateUserWallets(validData);
        expect(result).toHaveLength(0);
      });
    });

    describe("validateHealthCheckResponse", () => {
      it("returns validated data for valid input", () => {
        const validData = {
          status: "healthy",
          timestamp: "2025-01-17T00:00:00Z",
        };

        const result = validateHealthCheckResponse(validData);
        expect(result.status).toBe("healthy");
      });
    });

    describe("validateMessageResponse", () => {
      it("returns validated data for valid input", () => {
        const validData = {
          message: "Operation completed successfully",
        };

        const result = validateMessageResponse(validData);
        expect(result.message).toBe("Operation completed successfully");
      });
    });
  });
});
