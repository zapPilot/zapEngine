/**
 * Mock ETL (Extract, Transform, Load) data fixtures for testing new user wallet search flow.
 *
 * These fixtures cover all possible responses from the ETL job lifecycle:
 * - connectWallet responses (new vs existing users)
 * - ETL job status transitions (pending → processing → completed → failed)
 * - Error scenarios (rate limiting, conflicts, validation)
 *
 * @see src/services/accountService.ts - connectWallet service
 * @see src/hooks/wallet/useEtlJobPolling.ts - ETL polling state machine
 */

import type { ConnectWalletResponse } from "@/schemas/api/accountSchemas";

/**
 * Mock response for a NEW user connecting their wallet for the first time.
 * Includes ETL job that will poll for data fetching progress.
 */
export const NEW_USER_RESPONSE: ConnectWalletResponse = {
  user_id: "0x1234567890abcdef1234567890abcdef12345678",
  is_new_user: true,
  etl_job: {
    job_id: "etl-job-12345-abcde",
    status: "pending",
    message: "ETL job queued for processing",
  },
};

/**
 * Mock response for an EXISTING user connecting their wallet.
 * No ETL job needed since data already exists.
 */
export const EXISTING_USER_RESPONSE: ConnectWalletResponse = {
  user_id: "0xfedcba0987654321fedcba0987654321fedcba09",
  is_new_user: false,
  etl_job: undefined,
};

/**
 * Mock response when API rate limiting is triggered.
 * User should see error message and retry later.
 */
export const RATE_LIMITED_RESPONSE = {
  job_id: null,
  status: "rate_limited",
  message: "Too many requests. Please try again in 60 seconds.",
  rate_limited: true,
  retry_after: 60,
};

/**
 * ETL job status: PENDING
 * Job has been queued but processing hasn't started yet.
 */
export const ETL_STATUS_PENDING = {
  job_id: "etl-job-12345-abcde",
  status: "pending" as const,
  progress: 0,
  message: "Job queued, waiting to start...",
  created_at: "2026-01-10T10:00:00Z",
  updated_at: "2026-01-10T10:00:00Z",
};

/**
 * ETL job status: PROCESSING
 * Job is actively fetching wallet data from DeBank API.
 */
export const ETL_STATUS_PROCESSING = {
  job_id: "etl-job-12345-abcde",
  status: "processing" as const,
  progress: 50,
  message: "Fetching wallet data from DeBank...",
  created_at: "2026-01-10T10:00:00Z",
  updated_at: "2026-01-10T10:01:30Z",
};

/**
 * ETL job status: COMPLETED
 * Job successfully fetched and stored wallet data.
 * Frontend will map this to "completing" state to prevent race conditions.
 */
export const ETL_STATUS_COMPLETED = {
  job_id: "etl-job-12345-abcde",
  status: "completed" as const,
  progress: 100,
  message: "Wallet data successfully loaded",
  created_at: "2026-01-10T10:00:00Z",
  updated_at: "2026-01-10T10:03:00Z",
  completed_at: "2026-01-10T10:03:00Z",
};

/**
 * ETL job status: FAILED
 * Job encountered an error during data fetching.
 */
export const ETL_STATUS_FAILED = {
  job_id: "etl-job-12345-abcde",
  status: "failed" as const,
  progress: 0,
  message: "Failed to fetch wallet data",
  error: {
    code: "DEBANK_API_ERROR",
    message: "Failed to fetch wallet data from DeBank API",
    details: "Connection timeout after 30 seconds",
  },
  created_at: "2026-01-10T10:00:00Z",
  updated_at: "2026-01-10T10:02:00Z",
  failed_at: "2026-01-10T10:02:00Z",
};

/**
 * Error response: WALLET CONFLICT (409)
 * Wallet address is already associated with a different user account.
 */
export const WALLET_CONFLICT_ERROR = {
  status: 409,
  code: "WALLET_CONFLICT",
  message:
    "This wallet address is already associated with another account. Please disconnect it from the other account first or use a different wallet.",
  wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
  existing_user_id: "existing-user-456",
};

/**
 * Error response: VALIDATION ERROR (400)
 * Invalid wallet address format provided.
 */
export const VALIDATION_ERROR = {
  status: 400,
  code: "INVALID_WALLET_ADDRESS",
  message:
    "Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x.",
  provided_address: "0xinvalid",
  expected_format: "0x followed by 40 hexadecimal characters",
};

/**
 * Error response: NETWORK ERROR (500)
 * Generic server error during wallet connection.
 */
export const NETWORK_ERROR = {
  status: 500,
  code: "INTERNAL_SERVER_ERROR",
  message:
    "An unexpected error occurred while connecting your wallet. Please try again.",
};

/**
 * Error response: TIMEOUT ERROR
 * Request timed out before completing.
 */
export const TIMEOUT_ERROR = {
  code: "TIMEOUT",
  message: "Request timed out. Please check your connection and try again.",
  timeout_ms: 30000,
};

/**
 * Helper to create a custom ETL status response for testing
 */
export function createEtlStatus(
  overrides: Partial<typeof ETL_STATUS_PENDING>
): typeof ETL_STATUS_PENDING {
  return {
    ...ETL_STATUS_PENDING,
    ...overrides,
  };
}

/**
 * Helper to create a custom connectWallet response for testing
 */
export function createConnectWalletResponse(
  overrides: Partial<ConnectWalletResponse>
): ConnectWalletResponse {
  return {
    ...NEW_USER_RESPONSE,
    ...overrides,
  };
}

/**
 * Sequence of ETL statuses for testing progressive polling.
 * Simulates the typical flow: pending → processing → completed
 */
export const ETL_STATUS_SEQUENCE = [
  ETL_STATUS_PENDING,
  ETL_STATUS_PROCESSING,
  ETL_STATUS_COMPLETED,
] as const;

/**
 * Sequence for testing failure scenario.
 * Simulates: pending → processing → failed
 */
export const ETL_STATUS_SEQUENCE_WITH_FAILURE = [
  ETL_STATUS_PENDING,
  ETL_STATUS_PROCESSING,
  ETL_STATUS_FAILED,
] as const;

/**
 * Common test wallet addresses
 */
export const TEST_WALLET_ADDRESSES = {
  VALID_NEW: "0x1234567890abcdef1234567890abcdef12345678",
  VALID_EXISTING: "0xfedcba0987654321fedcba0987654321fedcba09",
  INVALID_SHORT: "0x123",
  INVALID_NO_PREFIX: "1234567890abcdef1234567890abcdef12345678",
  INVALID_SPECIAL_CHARS: "0x!@#$%^&*()1234567890abcdef1234567890ab",
} as const;

/**
 * Common test user IDs
 */
export const TEST_USER_IDS = {
  NEW_USER: "user-new-12345",
  EXISTING_USER: "user-existing-67890",
  CONFLICTING_USER: "user-conflict-11111",
} as const;

/**
 * Common test ETL job IDs
 */
export const TEST_JOB_IDS = {
  PENDING: "etl-job-pending-001",
  PROCESSING: "etl-job-processing-002",
  COMPLETED: "etl-job-completed-003",
  FAILED: "etl-job-failed-004",
} as const;
