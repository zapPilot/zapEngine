/**
 * Telegram integration interfaces
 */

/**
 * Response from requesting a Telegram connection token
 */
export interface TelegramTokenResponse {
  /** The verification token (32 hex chars) */
  token: string;
  /** Bot name for display purposes */
  botName: string;
  /** Deep link URL to open Telegram and connect */
  deepLink: string;
  /** Token expiration timestamp */
  expiresAt: string;
}

/**
 * Telegram connection status response
 */
export interface TelegramStatusResponse {
  /** Whether user has connected Telegram */
  isConnected: boolean;
  /** Whether notifications are enabled (user hasn't blocked bot) */
  isEnabled: boolean;
  /** Timestamp when user connected (if connected) */
  connectedAt?: string;
}
