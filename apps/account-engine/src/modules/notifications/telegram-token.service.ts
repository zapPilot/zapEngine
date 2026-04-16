import * as crypto from 'node:crypto';

import { ServiceLayerException } from '@common/exceptions';
import { BadRequestException } from '@common/http';
import { Logger } from '@common/logger';
import { DatabaseService } from '@database/database.service';

/**
 * Token generation response
 */
export interface TelegramTokenResult {
  token: string;
  expiresAt: Date;
}

/**
 * Database row for telegram_verification_tokens table
 */
interface TelegramVerificationToken {
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
}

/**
 * Service for managing Telegram verification tokens.
 *
 * Handles secure token generation, validation, and cleanup for the
 * Telegram connection flow. Tokens are:
 * - 16 bytes (32 hex chars) for sufficient entropy
 * - Single-use (marked as used after validation)
 * - Short-lived (10 minute expiry)
 * - Rate-limited (1 per minute per user)
 */
export class TelegramTokenService {
  private readonly logger = new Logger(TelegramTokenService.name);

  /** Token expiry time in milliseconds (10 minutes) */
  private readonly TOKEN_EXPIRY_MS = 10 * 60 * 1000;

  /** Rate limit window in milliseconds (1 minute) */
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 1000;

  /** Token length in bytes (16 bytes = 32 hex chars) */
  private readonly TOKEN_LENGTH_BYTES = 16;

  /* istanbul ignore next -- DI constructor */
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Generate a secure token for Telegram connection.
   *
   * Rate limited to 1 token per minute per user to prevent abuse.
   *
   * @param userId - The user's UUID
   * @returns Token string and expiration date
   * @throws BadRequestException if rate limit exceeded
   */
  async generateToken(userId: string): Promise<TelegramTokenResult> {
    // Check rate limit - only one token per minute per user
    const rateLimitCutoff = new Date(
      Date.now() - this.RATE_LIMIT_WINDOW_MS,
    ).toISOString();

    const { data: recentTokens, error: rateLimitError } =
      await this.databaseService
        .getServiceRoleClient()
        .from('telegram_verification_tokens')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', rateLimitCutoff)
        .order('created_at', { ascending: false })
        .limit(1);

    if (rateLimitError) {
      this.logger.error(
        `Rate limit check failed for user ${userId}:`,
        rateLimitError,
      );
      throw new ServiceLayerException('Failed to check rate limit');
    }

    if (recentTokens.length > 0) {
      throw new BadRequestException(
        'Rate limit: Please wait 1 minute before requesting a new token',
      );
    }

    // Generate cryptographically secure token
    const token = crypto.randomBytes(this.TOKEN_LENGTH_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_MS);

    // Store token in database
    const { error: insertError } = await this.databaseService
      .getServiceRoleClient()
      .from('telegram_verification_tokens')
      .insert({
        token,
        user_id: userId,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      this.logger.error(
        `Failed to store token for user ${userId}:`,
        insertError,
      );
      throw new ServiceLayerException('Failed to generate token');
    }

    this.logger.log(`Generated Telegram token for user ${userId}`);

    return { token, expiresAt };
  }

  /**
   * Validate a token and return the associated user ID.
   *
   * Checks that token:
   * - Exists in database
   * - Has not been used
   * - Has not expired
   *
   * @param token - The token to validate
   * @returns User ID if valid, null otherwise
   */
  async validateToken(token: string): Promise<string | null> {
    if (!token || token.length === 0) {
      return null;
    }

    const { data, error } = await this.databaseService
      .getServiceRoleClient()
      .from('telegram_verification_tokens')
      .select('user_id, expires_at, used_at')
      .eq('token', token)
      .single<
        Pick<TelegramVerificationToken, 'user_id' | 'expires_at' | 'used_at'>
      >();

    if (error) {
      this.logger.warn(`Token validation failed: token not found`);
      return null;
    }

    // Check if already used
    if (data.used_at) {
      this.logger.warn(`Token already used`);
      return null;
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      this.logger.warn(`Token expired`);
      return null;
    }

    return data.user_id;
  }

  /**
   * Mark a token as used (single-use enforcement).
   *
   * Called after successful Telegram connection to prevent token reuse.
   *
   * @param token - The token to invalidate
   */
  async invalidateToken(token: string): Promise<void> {
    const { error } = await this.databaseService
      .getServiceRoleClient()
      .from('telegram_verification_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token);

    if (error) {
      this.logger.error(`Failed to invalidate token:`, error);
      throw new ServiceLayerException('Failed to invalidate token');
    }

    this.logger.log(`Token invalidated successfully`);
  }

  /**
   * Clean up expired tokens.
   *
   * Calls the database function to remove:
   * - Tokens that have expired
   * - Used tokens older than 24 hours
   *
   * Should be called via cron job (daily).
   *
   * @returns Number of tokens deleted
   */
  async cleanupExpiredTokens(): Promise<number> {
    const { data, error } = await this.databaseService
      .getServiceRoleClient()
      .rpc('cleanup_expired_telegram_tokens');

    if (error) {
      this.logger.error('Failed to cleanup expired tokens:', error);
      throw new ServiceLayerException('Failed to cleanup expired tokens');
    }

    const deletedCount = typeof data === 'number' ? data : 0;
    this.logger.log(`Cleaned up ${deletedCount} expired Telegram tokens`);

    return deletedCount;
  }
}
