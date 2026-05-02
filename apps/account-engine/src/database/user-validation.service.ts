import { ServiceLayerException } from '../common/exceptions';
import { Logger } from '../common/logger';
import { Database } from '../types/database.types';
import { BaseService } from './base.service';
import { DatabaseService } from './database.service';
import { SupabaseErrorCode } from './supabase-error.handler';

export interface AvailabilityResult {
  isAvailable: boolean;
  belongsToCurrentUser?: boolean;
  existingUserId?: string;
}

/**
 * Specialized service for common user-related validation operations
 * Eliminates duplicate user existence checks across services
 */
export class UserValidationService extends BaseService {
  protected override readonly logger = new Logger(UserValidationService.name);

  /* istanbul ignore next -- DI constructor */
  constructor(databaseService: DatabaseService) {
    super(databaseService);
  }

  /**
   * Validates that a user exists in the database and returns their complete data.
   * Throws NotFoundException if the user is not found.
   */
  async validateUserExists(
    userId: string,
  ): Promise<Database['public']['Tables']['users']['Row']> {
    this.logger.debug(`Validating user existence: ${userId}`);

    return this.mustExist<Database['public']['Tables']['users']['Row']>(
      'users',
      { id: userId },
      'User',
      '*',
    );
  }

  /**
   * Validates that a wallet exists AND belongs to the specified user.
   * Throws NotFoundException if wallet doesn't exist or doesn't belong to the user.
   */
  async validateWalletOwnership(
    walletAddress: string,
    userId: string,
  ): Promise<Database['public']['Tables']['user_crypto_wallets']['Row']> {
    this.logger.debug(
      `Validating wallet ownership: ${walletAddress} for user: ${userId}`,
    );
    return this.mustExist<
      Database['public']['Tables']['user_crypto_wallets']['Row']
    >(
      'user_crypto_wallets',
      { wallet: walletAddress, user_id: userId },
      'Wallet',
      '*',
    );
  }

  /**
   * Checks if a wallet address is available for a specific user to claim/add to their bundle.
   * Does NOT throw exceptions - designed for API response construction.
   *
   * Return values:
   * - isAvailable: true = wallet doesn't exist (user can add it)
   * - isAvailable: false + belongsToCurrentUser: true = user already has this wallet
   * - isAvailable: false + belongsToCurrentUser: false = another user owns this wallet
   */
  async validateWalletAvailability(
    walletAddress: string,
    userId: string,
  ): Promise<AvailabilityResult> {
    this.logger.debug(
      `Validating wallet availability: ${walletAddress} for user: ${userId}`,
    );

    const validation = await this.validateWalletExists(walletAddress, userId);
    return this.buildAvailabilityResult(validation);
  }

  /**
   * Checks if an email address is available for a specific user to claim/set.
   * Does NOT throw exceptions - designed for API response construction.
   *
   * Return values:
   * - isAvailable: true = email not in use (user can claim it)
   * - isAvailable: false + belongsToCurrentUser: true = user already has this email
   * - isAvailable: false + belongsToCurrentUser: false = another user has this email
   */
  async validateEmailAvailability(
    email: string,
    userId: string,
  ): Promise<AvailabilityResult> {
    this.logger.debug(
      `Validating email availability: ${email} for user: ${userId}`,
    );

    const validation = await this.validateEmailAvailable(email, userId);
    return this.buildAvailabilityResult(validation);
  }

  /**
   * Gets the active (non-canceled) subscription for a user with plan details.
   */
  async getActiveSubscriptionWithPlan(userId: string): Promise<
    | (Database['public']['Tables']['user_subscriptions']['Row'] & {
        plans: Database['public']['Tables']['plans']['Row'];
      })
    | null
  > {
    this.logger.debug(
      `Fetching active subscription with plan for user: ${userId}`,
    );

    return this.findOne<
      Database['public']['Tables']['user_subscriptions']['Row'] & {
        plans: Database['public']['Tables']['plans']['Row'];
      }
    >(
      'user_subscriptions',
      { user_id: userId, is_canceled: false },
      {
        select: `
          *,
          plans (
            code,
            name,
            tier
          )
        `,
        entityName: 'Subscription',
        throwOnNotFound: false,
      },
    );
  }

  // --- Private helpers ---

  private async validateWalletExists(
    walletAddress: string,
    expectedUserId?: string,
  ): Promise<{
    exists: boolean;
    userId?: string;
    walletId?: string;
    belongsToUser?: boolean;
  }> {
    const wallet = await this.findOne<
      Database['public']['Tables']['user_crypto_wallets']['Row']
    >(
      'user_crypto_wallets',
      { wallet: walletAddress },
      {
        select: 'id, user_id, wallet',
        entityName: 'Wallet',
        throwOnNotFound: false,
      },
    );

    if (!wallet) {
      return { exists: false };
    }

    const belongsToUser = expectedUserId
      ? String(wallet.user_id) === expectedUserId
      : undefined;

    return {
      exists: true,
      userId: String(wallet.user_id),
      walletId: wallet.id,
      belongsToUser,
    };
  }

  private async validateEmailAvailable(
    email: string,
    excludeUserId?: string,
  ): Promise<{ exists: boolean; userId?: string; belongsToUser?: boolean }> {
    let query = this.supabase.from('users').select('id').eq('email', email);

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const result = await query.single();

    if (
      result.error &&
      result.error.code !== (SupabaseErrorCode.NO_ROWS_FOUND as string)
    ) {
      this.logger.error('Error checking email availability:', result.error);
      throw new ServiceLayerException('Failed to validate email availability');
    }

    const exists = result.data !== null;
    const belongsToUser =
      excludeUserId && exists ? result.data.id === excludeUserId : undefined;

    return {
      exists,
      userId: exists ? result.data.id : undefined,
      belongsToUser,
    };
  }

  private buildAvailabilityResult<
    T extends { exists: boolean; userId?: string; belongsToUser?: boolean },
  >(
    validation: T,
  ): {
    isAvailable: boolean;
    belongsToCurrentUser?: boolean;
    existingUserId?: string;
  } {
    if (!validation.exists) {
      return { isAvailable: true };
    }

    return {
      isAvailable: false,
      belongsToCurrentUser: validation.belongsToUser ?? false,
      existingUserId: validation.userId,
    };
  }
}
