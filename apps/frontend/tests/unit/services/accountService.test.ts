import { beforeEach, describe, expect, it, vi } from "vitest";

import { httpUtils } from "@/lib/http";
import type {
  AddWalletResponse,
  ConnectWalletResponse,
  UpdateEmailResponse,
  UserCryptoWallet,
  UserProfileResponse,
} from "@/schemas/api/accountSchemas";
import * as accountService from "@/services/accountService";

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

const PRIMARY_WALLET = "0x1234567890123456789012345678901234567890";
const SECONDARY_WALLET = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

function createConnectWalletResponse(
  overrides: Partial<ConnectWalletResponse> = {}
): ConnectWalletResponse {
  return {
    user_id: "user123",
    is_new_user: false,
    ...overrides,
  };
}

function createUserProfileResponse(
  overrides: Partial<UserProfileResponse> = {}
): UserProfileResponse {
  return {
    user: {
      id: "user123",
      email: "test@example.com",
      is_subscribed_to_reports: true,
      created_at: "2024-01-01T00:00:00Z",
    },
    wallets: [
      {
        id: "wallet1",
        user_id: "user123",
        wallet: PRIMARY_WALLET,
        label: "Main Wallet",
        created_at: "2024-01-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

function createUpdateEmailResponse(message: string): UpdateEmailResponse {
  return {
    success: true,
    message,
  };
}

function createWallets(): UserCryptoWallet[] {
  return [
    {
      id: "wallet1",
      user_id: "user123",
      wallet: PRIMARY_WALLET,
      label: "Main Wallet",
      created_at: "2024-01-01T00:00:00Z",
    },
    {
      id: "wallet2",
      user_id: "user123",
      wallet: SECONDARY_WALLET,
      created_at: "2024-01-02T00:00:00Z",
    },
  ];
}

async function expectAccountServiceError(
  promise: Promise<unknown>,
  message?: string
): Promise<void> {
  if (message) {
    await expect(promise).rejects.toThrow(message);
    return;
  }

  await expect(promise).rejects.toThrow();
}

describe("accountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("connectWallet", () => {
    it.each([
      {
        label: "existing users",
        wallet: PRIMARY_WALLET,
        response: createConnectWalletResponse(),
      },
      {
        label: "new users",
        wallet: SECONDARY_WALLET,
        response: createConnectWalletResponse({
          user_id: "user456",
          is_new_user: true,
        }),
      },
    ])(
      "returns validated responses for $label",
      async ({ wallet, response }) => {
        vi.mocked(httpUtils.accountApi.post).mockResolvedValue(response);

        await expect(accountService.connectWallet(wallet)).resolves.toEqual(
          response
        );
        expect(httpUtils.accountApi.post).toHaveBeenCalledWith(
          "/users/connect-wallet",
          {
            wallet,
          }
        );
      }
    );

    it.each([
      {
        label: "minimal etl job fields",
        response: createConnectWalletResponse({
          user_id: "12a5184b-ec53-4ab7-b42b-70cb063308b6",
          is_new_user: true,
          etl_job: {
            job_id: "etl_1767881497530_1rw7jo",
            status: "pending",
            message: "Wallet data fetch job queued successfully",
            rate_limited: false,
          },
        }),
        expected: {
          job_id: "etl_1767881497530_1rw7jo",
          status: "pending",
          message: "Wallet data fetch job queued successfully",
          rate_limited: false,
        },
      },
      {
        label: "all optional etl job fields",
        response: createConnectWalletResponse({
          etl_job: {
            job_id: "job-full",
            status: "completed",
            trigger: "webhook",
            created_at: "2024-01-01T00:00:00Z",
            completed_at: "2024-01-01T02:00:00Z",
            records_processed: 100,
            records_inserted: 95,
            message: "Job completed successfully",
          },
        }),
        expected: {
          job_id: "job-full",
          status: "completed",
          trigger: "webhook",
          created_at: "2024-01-01T00:00:00Z",
          completed_at: "2024-01-01T02:00:00Z",
          records_processed: 100,
          records_inserted: 95,
          message: "Job completed successfully",
        },
      },
    ])("preserves $label", async ({ response, expected }) => {
      vi.mocked(httpUtils.accountApi.post).mockResolvedValue(response);

      const result = await accountService.connectWallet(PRIMARY_WALLET);

      expect(result.etl_job).toEqual(expected);
    });

    it("returns existing users without etl job metadata", async () => {
      const response = createConnectWalletResponse({
        user_id: "user789",
        is_new_user: false,
      });
      vi.mocked(httpUtils.accountApi.post).mockResolvedValue(response);

      const result = await accountService.connectWallet(PRIMARY_WALLET);

      expect(result.user_id).toBe("user789");
      expect(result.is_new_user).toBe(false);
      expect(result.etl_job).toBeUndefined();
    });

    it("throws AccountServiceError when etl job validation fails", async () => {
      vi.mocked(httpUtils.accountApi.post).mockResolvedValue({
        user_id: "user999",
        is_new_user: true,
        etl_job: {
          status: "pending",
          message: "Test",
        },
      });

      await expect(
        accountService.connectWallet(PRIMARY_WALLET)
      ).rejects.toThrow(accountService.AccountServiceError);
    });

    it.each([
      {
        label: "invalid wallet input",
        error: { status: 400, message: "Invalid wallet parameter" },
        expectedMessage:
          "Invalid wallet address format. Must be a 42-character Ethereum address.",
      },
      {
        label: "generic bad request",
        error: { status: 400, message: "Bad request general" },
        expectedMessage: "Bad request general",
      },
      {
        label: "user not found from response status",
        error: { message: "Not found", response: { status: 404 } },
        expectedMessage:
          "User account not found. Please connect your wallet first.",
      },
      {
        label: "unprocessable entity",
        error: { status: 422, message: "Whatever" },
        expectedMessage:
          "Invalid request data. Please check your input and try again.",
      },
      {
        label: "plain string errors",
        error: "Just a string error",
        expectedMessage: "Account service error",
      },
      {
        label: "null errors",
        error: null,
        expectedMessage: "Account service error",
      },
    ])("maps $label", async ({ error, expectedMessage }) => {
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue(error);

      await expectAccountServiceError(
        accountService.connectWallet("invalid-address"),
        expectedMessage
      );
    });

    it("preserves extra error fields on wrapped errors", async () => {
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue({
        status: 500,
        message: "Server error",
        code: "INTERNAL_ERROR",
        details: { trace: "abc123" },
      });

      await expect(accountService.connectWallet("0x123")).rejects.toMatchObject(
        {
          message: "Server error",
          code: "INTERNAL_ERROR",
          details: { trace: "abc123" },
        }
      );
    });
  });

  describe("getUserProfile", () => {
    it.each([
      {
        label: "basic profile data",
        response: createUserProfileResponse(),
      },
      {
        label: "subscription data",
        response: createUserProfileResponse({
          wallets: [],
          subscription: {
            id: "sub123",
            user_id: "user123",
            plan_code: "PRO",
            starts_at: "2024-01-01T00:00:00Z",
            is_canceled: false,
            created_at: "2024-01-01T00:00:00Z",
          },
        }),
      },
    ])("returns $label", async ({ response }) => {
      vi.mocked(httpUtils.accountApi.get).mockResolvedValue(response);

      await expect(accountService.getUserProfile("user123")).resolves.toEqual(
        response
      );
      expect(httpUtils.accountApi.get).toHaveBeenCalledWith("/users/user123");
    });

    it("wraps not-found profile errors", async () => {
      vi.mocked(httpUtils.accountApi.get).mockRejectedValue({
        status: 404,
        message: "User not found",
      });

      await expectAccountServiceError(
        accountService.getUserProfile("nonexistent")
      );
    });
  });

  describe("updateUserEmail", () => {
    it("updates email successfully", async () => {
      const response = createUpdateEmailResponse("Email updated successfully");
      vi.mocked(httpUtils.accountApi.put).mockResolvedValue(response);

      await expect(
        accountService.updateUserEmail("user123", "newemail@example.com")
      ).resolves.toEqual(response);
      expect(httpUtils.accountApi.put).toHaveBeenCalledWith(
        "/users/user123/email",
        {
          email: "newemail@example.com",
        }
      );
    });

    it.each([
      {
        label: "duplicate emails",
        error: { status: 409, message: "email exists" },
        expectedMessage: "This email address is already in use.",
      },
      {
        label: "invalid email formats",
        error: { status: 422, message: "Invalid email format" },
        expectedMessage:
          "Invalid request data. Please check your input and try again.",
      },
    ])("maps $label", async ({ error, expectedMessage }) => {
      vi.mocked(httpUtils.accountApi.put).mockRejectedValue(error);

      await expectAccountServiceError(
        accountService.updateUserEmail("user123", "existing@example.com"),
        expectedMessage
      );
    });
  });

  describe("removeUserEmail", () => {
    it("removes email successfully", async () => {
      const response = createUpdateEmailResponse("Email removed successfully");
      vi.mocked(httpUtils.accountApi.delete).mockResolvedValue(response);

      await expect(accountService.removeUserEmail("user123")).resolves.toEqual(
        response
      );
      expect(httpUtils.accountApi.delete).toHaveBeenCalledWith(
        "/users/user123/email"
      );
    });

    it("wraps user-not-found errors", async () => {
      vi.mocked(httpUtils.accountApi.delete).mockRejectedValue({
        status: 404,
        message: "User not found",
      });

      await expectAccountServiceError(
        accountService.removeUserEmail("nonexistent")
      );
    });
  });

  describe("deleteUser", () => {
    it("deletes users successfully", async () => {
      const response = createUpdateEmailResponse("User deleted successfully");
      vi.mocked(httpUtils.accountApi.delete).mockResolvedValue(response);

      await expect(accountService.deleteUser("user123")).resolves.toEqual(
        response
      );
      expect(httpUtils.accountApi.delete).toHaveBeenCalledWith(
        "/users/user123"
      );
    });

    it("wraps user-not-found errors", async () => {
      vi.mocked(httpUtils.accountApi.delete).mockRejectedValue({
        status: 404,
        message: "User not found",
      });

      await expectAccountServiceError(accountService.deleteUser("nonexistent"));
    });
  });

  describe("getUserWallets", () => {
    it.each([
      {
        label: "wallet collections",
        response: createWallets(),
        expectedLength: 2,
      },
      {
        label: "empty wallet collections",
        response: [],
        expectedLength: 0,
      },
    ])("returns $label", async ({ response, expectedLength }) => {
      vi.mocked(httpUtils.accountApi.get).mockResolvedValue(response);

      const result = await accountService.getUserWallets("user123");

      expect(result).toEqual(response);
      expect(result).toHaveLength(expectedLength);
      expect(httpUtils.accountApi.get).toHaveBeenCalledWith(
        "/users/user123/wallets"
      );
    });
  });

  describe("addWalletToBundle", () => {
    it.each([
      {
        label: "without labels",
        wallet: PRIMARY_WALLET,
        labelValue: undefined,
        response: {
          wallet_id: "wallet123",
          message: "Wallet added successfully",
        } satisfies AddWalletResponse,
      },
      {
        label: "with labels",
        wallet: SECONDARY_WALLET,
        labelValue: "Trading Wallet",
        response: {
          wallet_id: "wallet456",
          message: "Wallet added successfully",
        } satisfies AddWalletResponse,
      },
    ])("adds wallets $label", async ({ wallet, labelValue, response }) => {
      vi.mocked(httpUtils.accountApi.post).mockResolvedValue(response);

      await expect(
        accountService.addWalletToBundle("user123", wallet, labelValue)
      ).resolves.toEqual(response);
      expect(httpUtils.accountApi.post).toHaveBeenCalledWith(
        "/users/user123/wallets",
        {
          wallet,
          label: labelValue,
        }
      );
    });

    it.each([
      {
        label: "wallet conflicts",
        error: { status: 409, message: "This wallet is taken" },
        expectedMessage: "This wallet is already associated with an account.",
      },
      {
        label: "cross-account wallet conflicts",
        error: {
          status: 409,
          message:
            "wallet already belongs to another user, please delete one of the accounts instead",
        },
        expectedMessage:
          "wallet already belongs to another user, please delete one of the accounts instead",
      },
      {
        label: "invalid wallets",
        error: { status: 400, message: "Invalid wallet address" },
        expectedMessage:
          "Invalid wallet address format. Must be a 42-character Ethereum address.",
      },
    ])("maps $label", async ({ error, expectedMessage }) => {
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue(error);

      await expectAccountServiceError(
        accountService.addWalletToBundle("user123", PRIMARY_WALLET),
        expectedMessage
      );
    });
  });

  describe("removeWalletFromBundle", () => {
    it("removes wallets successfully", async () => {
      const response = {
        message: "Wallet removed successfully",
      };
      vi.mocked(httpUtils.accountApi.delete).mockResolvedValue(response);

      await expect(
        accountService.removeWalletFromBundle("user123", "wallet456")
      ).resolves.toEqual(response);
      expect(httpUtils.accountApi.delete).toHaveBeenCalledWith(
        "/users/user123/wallets/wallet456"
      );
    });

    it("wraps wallet-not-found errors", async () => {
      vi.mocked(httpUtils.accountApi.delete).mockRejectedValue({
        status: 404,
        message: "Wallet not found",
      });

      await expectAccountServiceError(
        accountService.removeWalletFromBundle("user123", "nonexistent")
      );
    });
  });

  describe("updateWalletLabel", () => {
    it.each([{ labelValue: "New Label" }, { labelValue: "" }])(
      "updates wallet labels when label is '$labelValue'",
      async ({ labelValue }) => {
        const response = {
          message: "Label updated successfully",
        };
        vi.mocked(httpUtils.accountApi.put).mockResolvedValue(response);

        await expect(
          accountService.updateWalletLabel(
            "user123",
            PRIMARY_WALLET,
            labelValue
          )
        ).resolves.toEqual(response);
        expect(httpUtils.accountApi.put).toHaveBeenCalledWith(
          `/users/user123/wallets/${PRIMARY_WALLET}/label`,
          {
            label: labelValue,
          }
        );
      }
    );

    it("wraps wallet-not-found errors", async () => {
      vi.mocked(httpUtils.accountApi.put).mockRejectedValue({
        status: 404,
        message: "Wallet not found",
      });

      await expectAccountServiceError(
        accountService.updateWalletLabel("user123", "nonexistent", "Label")
      );
    });
  });

  describe("triggerWalletDataFetch", () => {
    it("triggers wallet data fetches", async () => {
      const response = {
        job_id: "job123",
        status: "processing",
        message: "Request accepted",
      };
      vi.mocked(httpUtils.accountApi.post).mockResolvedValue(response);

      await expect(
        accountService.triggerWalletDataFetch("user123", "0x123")
      ).resolves.toEqual(response);
      expect(httpUtils.accountApi.post).toHaveBeenCalledWith(
        "/users/user123/wallets/0x123/fetch-data"
      );
    });

    it("wraps trigger errors", async () => {
      vi.mocked(httpUtils.accountApi.post).mockRejectedValue({
        status: 500,
        message: "Internal server error",
      });

      await expectAccountServiceError(
        accountService.triggerWalletDataFetch("user123", "0x123")
      );
    });
  });

  describe("getEtlJobStatus", () => {
    it("returns ETL job status", async () => {
      const response = {
        job_id: "job123",
        status: "completed",
        trigger: "manual",
        created_at: "2024-01-01T00:00:00Z",
      };
      vi.mocked(httpUtils.accountApi.get).mockResolvedValue(response);

      await expect(accountService.getEtlJobStatus("job123")).resolves.toEqual({
        jobId: "job123",
        status: "completed",
        trigger: "manual",
        createdAt: "2024-01-01T00:00:00Z",
        recordsProcessed: undefined,
        recordsInserted: undefined,
        duration: undefined,
        completedAt: undefined,
        error: undefined,
      });
      expect(httpUtils.accountApi.get).toHaveBeenCalledWith("/etl/jobs/job123");
    });

    it("wraps ETL lookup errors", async () => {
      vi.mocked(httpUtils.accountApi.get).mockRejectedValue({
        status: 404,
        message: "Job not found",
      });

      await expectAccountServiceError(accountService.getEtlJobStatus("job123"));
    });
  });

  describe("AccountServiceError", () => {
    it("stores error metadata", () => {
      const error = new accountService.AccountServiceError(
        "Test error",
        400,
        "TEST_ERROR",
        { field: "wallet" }
      );

      expect(error.message).toBe("Test error");
      expect(error.status).toBe(400);
      expect(error.code).toBe("TEST_ERROR");
      expect(error.details).toEqual({ field: "wallet" });
      expect(error.name).toBe("AccountServiceError");
    });
  });
});
