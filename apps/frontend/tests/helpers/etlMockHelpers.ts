/**
 * Reusable mock helper functions for ETL wallet search flow testing.
 *
 * These utilities simplify the creation of progressive mocks that simulate:
 * - ETL job status transitions (pending → processing → completed)
 * - connectWallet service responses (new vs existing users)
 * - Fake timer advancement for polling intervals
 *
 * @example
 * ```typescript
 * // Create a progressive ETL status mock
 * const mockGetEtlStatus = createProgressiveEtlMock(["pending", "processing", "completed"]);
 *
 * // Create a connectWallet mock for new user
 * const mockConnectWallet = createConnectWalletMock({ isNewUser: true, hasEtlJob: true });
 *
 * // Advance through polling cycles
 * await advancePollingCycle(2); // Advances 6 seconds (2 cycles × 3s)
 * ```
 */

import { vi } from 'vitest';

import type { ConnectWalletResponse } from '@/schemas/api/accountSchemas';

import {
  ETL_STATUS_COMPLETED,
  ETL_STATUS_FAILED,
  ETL_STATUS_PENDING,
  ETL_STATUS_PROCESSING,
  EXISTING_USER_RESPONSE,
  NETWORK_ERROR,
  NEW_USER_RESPONSE,
  VALIDATION_ERROR,
  WALLET_CONFLICT_ERROR,
} from '../fixtures/mockEtlData';

/**
 * ETL job status values used in the state machine.
 */
type EtlStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'idle';

/**
 * Error types that can occur during wallet connection.
 */
type ErrorType = 'validation' | 'connection' | 'conflict' | 'timeout';

/**
 * Creates a mock function that returns progressive ETL statuses.
 *
 * On each call, returns the next status in the sequence. Once the sequence
 * is exhausted, continues returning the final status.
 *
 * This simulates the ETL polling behavior where status progresses:
 * pending → processing → completed (or failed)
 *
 * @param statusSequence - Array of statuses to return in order
 * @returns Mock function that returns ETL status responses
 *
 * @example
 * ```typescript
 * const mockGetStatus = createProgressiveEtlMock(["pending", "processing", "completed"]);
 *
 * await mockGetStatus(); // Returns pending status
 * await mockGetStatus(); // Returns processing status
 * await mockGetStatus(); // Returns completed status
 * await mockGetStatus(); // Continues returning completed status
 * ```
 */
export function createProgressiveEtlMock(statusSequence: EtlStatus[]) {
  let callCount = 0;

  return vi.fn(() => {
    const currentIndex = Math.min(callCount, statusSequence.length - 1);
    const status = statusSequence[currentIndex];
    callCount++;

    // Map status to corresponding fixture data
    const statusData = {
      pending: ETL_STATUS_PENDING,
      processing: ETL_STATUS_PROCESSING,
      completed: ETL_STATUS_COMPLETED,
      failed: ETL_STATUS_FAILED,
      idle: { ...ETL_STATUS_PENDING, status: 'idle' as const, progress: 0 },
    };

    return Promise.resolve(statusData[status]);
  });
}

/**
 * Options for creating a connectWallet mock.
 */
interface ConnectWalletMockOptions {
  /** Whether this is a new user (determines if ETL job is included) */
  isNewUser: boolean;
  /** Whether ETL job should be included in response (only applies if isNewUser is true) */
  hasEtlJob: boolean;
  /** Whether the call should error instead of succeeding */
  shouldError?: boolean;
  /** Type of error to throw (only if shouldError is true) */
  errorType?: ErrorType;
  /** Custom user ID to return */
  userId?: string;
  /** Custom ETL job ID to return */
  jobId?: string;
}

/**
 * Creates a configurable mock for the connectWallet service function.
 *
 * Supports different scenarios:
 * - New user with ETL job
 * - Existing user without ETL job
 * - Various error types (validation, connection, conflict)
 *
 * @param options - Configuration for the mock behavior
 * @returns Mock function matching connectWallet signature
 *
 * @example
 * ```typescript
 * // New user scenario
 * const mockConnect = createConnectWalletMock({ isNewUser: true, hasEtlJob: true });
 *
 * // Existing user scenario
 * const mockConnect = createConnectWalletMock({ isNewUser: false, hasEtlJob: false });
 *
 * // Validation error scenario
 * const mockConnect = createConnectWalletMock({
 *   isNewUser: true,
 *   hasEtlJob: false,
 *   shouldError: true,
 *   errorType: "validation"
 * });
 * ```
 */
export function createConnectWalletMock(
  options: ConnectWalletMockOptions,
): ReturnType<typeof vi.fn<[], Promise<ConnectWalletResponse>>> {
  const {
    isNewUser,
    hasEtlJob,
    shouldError = false,
    errorType = 'validation',
    userId,
    jobId,
  } = options;

  if (shouldError) {
    return vi.fn(() => {
      const error = new Error('Wallet connection failed');

      switch (errorType) {
        case 'validation':
          error.message = VALIDATION_ERROR.message;
          (error as any).status = VALIDATION_ERROR.status;
          break;
        case 'conflict':
          error.message = WALLET_CONFLICT_ERROR.message;
          (error as any).status = WALLET_CONFLICT_ERROR.status;
          break;
        case 'timeout':
          error.message = 'Request timeout';
          error.name = 'TimeoutError';
          break;
        case 'connection':
        default:
          error.message = NETWORK_ERROR.message;
          (error as any).status = NETWORK_ERROR.status;
      }

      return Promise.reject(error);
    });
  }

  return vi.fn(() => {
    const baseResponse = isNewUser ? NEW_USER_RESPONSE : EXISTING_USER_RESPONSE;

    const response: ConnectWalletResponse = {
      ...baseResponse,
      ...(userId && { user_id: userId }),
    };

    // Add ETL job if requested and user is new
    if (isNewUser && hasEtlJob) {
      response.etl_job = {
        job_id: jobId || 'test-etl-job-123',
        status: 'pending',
        message: 'ETL job queued',
      };
    }

    return Promise.resolve(response);
  });
}

/**
 * Default polling interval in milliseconds (matches production code).
 * @see src/hooks/wallet/useEtlJobPolling.ts
 */
export const POLLING_INTERVAL_MS = 3000;

/**
 * Advances fake timers through one or more polling cycles.
 *
 * Each cycle represents one polling interval (default 3 seconds).
 * Useful for testing time-dependent behavior without actual delays.
 *
 * @param times - Number of polling cycles to advance (default: 1)
 * @param interval - Milliseconds per cycle (default: 3000ms)
 *
 * @example
 * ```typescript
 * // Setup fake timers
 * vi.useFakeTimers();
 *
 * // Advance through 2 polling cycles (6 seconds)
 * await advancePollingCycle(2);
 *
 * // Verify ETL status was polled twice
 * expect(mockGetEtlStatus).toHaveBeenCalledTimes(2);
 *
 * // Clean up
 * vi.useRealTimers();
 * ```
 */
export async function advancePollingCycle(
  times = 1,
  interval = POLLING_INTERVAL_MS,
): Promise<void> {
  for (let i = 0; i < times; i++) {
    await vi.advanceTimersByTimeAsync(interval);
  }
}

/**
 * Creates a mock for getEtlJobStatus that returns different statuses based on call count.
 *
 * Similar to createProgressiveEtlMock but specifically typed for getEtlJobStatus service.
 *
 * @param statuses - Array of statuses to cycle through
 * @returns Mock function that progresses through statuses
 *
 * @example
 * ```typescript
 * const mockGetStatus = createEtlJobStatusMock(["pending", "processing", "completed"]);
 *
 * mockGetStatus("job-123"); // Returns { status: "pending", ... }
 * mockGetStatus("job-123"); // Returns { status: "processing", ... }
 * mockGetStatus("job-123"); // Returns { status: "completed", ... }
 * ```
 */
export function createEtlJobStatusMock(statuses: EtlStatus[]) {
  let callCount = 0;

  return vi.fn((jobId: string) => {
    const currentIndex = Math.min(callCount, statuses.length - 1);
    const status = statuses[currentIndex];
    callCount++;

    const statusData = {
      pending: ETL_STATUS_PENDING,
      processing: ETL_STATUS_PROCESSING,
      completed: ETL_STATUS_COMPLETED,
      failed: ETL_STATUS_FAILED,
      idle: { ...ETL_STATUS_PENDING, status: 'idle' as const },
    };

    return Promise.resolve({
      ...statusData[status],
      job_id: jobId,
    });
  });
}

/**
 * Resets all ETL-related mocks to their initial state.
 *
 * Call this in beforeEach or afterEach to ensure test isolation.
 *
 * @param mocks - Object containing mock functions to reset
 *
 * @example
 * ```typescript
 * const mockConnectWallet = createConnectWalletMock({ isNewUser: true, hasEtlJob: true });
 * const mockGetEtlStatus = createProgressiveEtlMock(["pending", "completed"]);
 *
 * afterEach(() => {
 *   resetEtlMocks({ mockConnectWallet, mockGetEtlStatus });
 * });
 * ```
 */
export function resetEtlMocks(
  mocks: Record<string, ReturnType<typeof vi.fn>>,
): void {
  for (const mock of Object.values(mocks)) {
    if (mock && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  }
}

/**
 * Creates a mock router with common navigation methods.
 *
 * Useful for testing components that use the app router adapter.
 *
 * @returns Object with mocked router functions
 *
 * @example
 * ```typescript
 * const router = createMockRouter();
 *
 * // In your test
 * await handleSearch("0x123...");
 * expect(router.push).toHaveBeenCalledWith("/bundle?userId=...");
 * ```
 */
export function createMockRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };
}

/**
 * Creates a mock toast provider with showToast function.
 *
 * @returns Object with mocked toast functions
 *
 * @example
 * ```typescript
 * const toast = createMockToast();
 *
 * // In your test
 * await handleSearchError();
 * expect(toast.showToast).toHaveBeenCalledWith({
 *   type: "error",
 *   title: "Invalid Address",
 *   message: expect.any(String)
 * });
 * ```
 */
export function createMockToast() {
  return {
    showToast: vi.fn(),
    hideToast: vi.fn(),
  };
}

/**
 * Waits for all pending promises to resolve.
 *
 * Useful after triggering async actions in tests.
 *
 * @example
 * ```typescript
 * fireEvent.click(searchButton);
 * await flushPromises();
 * expect(mockConnectWallet).toHaveBeenCalled();
 * ```
 */
export async function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
