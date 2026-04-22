/**
 * Telegram Service
 * Service functions for Telegram notification integration (port 3004 - Account Engine)
 *
 * Handles:
 * - Request verification token for Telegram bot connection
 * - Check Telegram connection status
 * - Disconnect Telegram account
 */

import { AccountServiceError } from '@/lib/errors';
import { httpUtils } from '@/lib/http';
import { createServiceCaller } from '@/lib/http/createServiceCaller';
import { createServiceError } from '@/lib/http/serviceErrorUtils';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Response from requesting a Telegram verification token
 */
export interface TelegramTokenResponse {
  /** 32-character hex verification token */
  token: string;
  /** Telegram bot username */
  botName: string;
  /** Deep link to open Telegram bot */
  deepLink: string;
  /** Token expiration timestamp (ISO 8601) */
  expiresAt: string;
}

/**
 * Telegram connection status for a user
 */
export interface TelegramStatus {
  /** Whether user has connected Telegram */
  isConnected: boolean;
  /** Whether notifications are enabled (user hasn't blocked bot) */
  isEnabled: boolean;
  /** When the connection was established */
  connectedAt: string | null;
}

/**
 * Response from disconnect operation
 */
export interface TelegramDisconnectResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

function mapTelegramServiceErrorMessage(
  status: number,
  message: string,
): string {
  switch (status) {
    case 404:
      return 'User not found. Please connect your wallet first.';
    case 409:
      return 'Telegram account is already connected.';
    case 410:
      return 'Verification token has expired. Please request a new one.';
    case 429:
      return 'Too many requests. Please wait before trying again.';
    default:
      return message;
  }
}

function createTelegramServiceError(error: unknown): AccountServiceError {
  return createServiceError(
    error,
    AccountServiceError,
    'Telegram service error',
    mapTelegramServiceErrorMessage,
  );
}

// ============================================================================
// API CLIENT
// ============================================================================

const accountApiClient = httpUtils.accountApi;
const callTelegramApi = createServiceCaller(createTelegramServiceError);

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Request a verification token for Telegram bot connection.
 * The token is used to verify the user when they start the bot.
 *
 * @param userId - User identifier
 * @returns Token details including deep link to open Telegram
 *
 * @example
 * ```typescript
 * const { token, deepLink } = await requestTelegramToken(userId);
 * window.open(deepLink, '_blank');
 * ```
 */
export async function requestTelegramToken(
  userId: string,
): Promise<TelegramTokenResponse> {
  return callTelegramApi(() =>
    accountApiClient.post<TelegramTokenResponse>(
      `/users/${userId}/telegram/request-token`,
    ),
  );
}

/**
 * Get the current Telegram connection status for a user.
 *
 * @param userId - User identifier
 * @returns Connection status with enabled flag
 *
 * @example
 * ```typescript
 * const { isConnected, isEnabled } = await getTelegramStatus(userId);
 * ```
 */
export async function getTelegramStatus(
  userId: string,
): Promise<TelegramStatus> {
  return callTelegramApi(() =>
    accountApiClient.get<TelegramStatus>(`/users/${userId}/telegram/status`),
  );
}

/**
 * Disconnect Telegram account from user.
 * Stops all Telegram notifications for this user.
 *
 * @param userId - User identifier
 * @returns Confirmation message
 *
 * @example
 * ```typescript
 * await disconnectTelegram(userId);
 * // User will no longer receive Telegram notifications
 * ```
 */
export async function disconnectTelegram(
  userId: string,
): Promise<TelegramDisconnectResponse> {
  return callTelegramApi(() =>
    accountApiClient.delete<TelegramDisconnectResponse>(
      `/users/${userId}/telegram/disconnect`,
    ),
  );
}
