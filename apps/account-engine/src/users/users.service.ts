import { equalsAddress } from '@zapengine/types/shared';

import { CHANNEL_TYPE_TELEGRAM } from '../common/constants';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../common/http';
import { AlphaEtlHttpService } from '../common/services';
import {
  generateDefaultWalletLabel,
  getErrorMessage,
  truncateForLog,
} from '../common/utils';
import { BaseService } from '../database/base.service';
import { DatabaseService } from '../database/database.service';
import { UserValidationService } from '../database/user-validation.service';
import { ReportUnsubscribeTokenService } from '../modules/notifications/report-unsubscribe-token.service';
// EtlJobStatus type from @zapengine/types/etl is used by AlphaEtlHttpService
import { TelegramService } from '../modules/notifications/telegram.service';
import { TelegramTokenService } from '../modules/notifications/telegram-token.service';
import type {
  AccountDeletionChallenge,
  AccountDeletionChallengeService,
} from '../services/account-deletion-challenge.service';
import type {
  WalletBindingChallenge,
  WalletBindingChallengeService,
} from '../services/wallet-binding-challenge.service';
import {
  AddWalletResponse,
  ConnectWalletResponse,
  EtlJobResponse,
  SuccessResponse,
  TelegramStatusResponse,
  TelegramTokenResponse,
  UpdateEmailResponse,
  UpdateWalletLabelResponse,
  UserCryptoWallet,
  UserProfileResponse,
  VerifyWalletResponse,
} from './interfaces';

/**
 * Expected response from create_user_with_wallet_and_plan RPC
 */
interface CreateUserRpcResponse {
  user_id: string;
  is_new_user: boolean;
}

/**
 * Snake_case version of EtlJobStatus for API responses
 * (The API transforms from camelCase to snake_case for consistency)
 */
export interface EtlJobStatusApiResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

export class UsersService extends BaseService {
  /* istanbul ignore next -- DI constructor */
  constructor(
    databaseService: DatabaseService,
    private readonly userValidationService: UserValidationService,
    private readonly alphaEtlHttpService: AlphaEtlHttpService,
    private readonly telegramService: TelegramService,
    private readonly telegramTokenService: TelegramTokenService,
    private readonly walletBindingChallengeService: WalletBindingChallengeService,
    private readonly accountDeletionChallengeService: AccountDeletionChallengeService,
    private readonly reportUnsubscribeTokenService: ReportUnsubscribeTokenService,
  ) {
    super(databaseService);
  }

  async connectWallet(wallet: string): Promise<ConnectWalletResponse> {
    return this.withErrorHandling(async () => {
      const result = (await this.databaseService.rpc(
        'create_user_with_wallet_and_plan',
        { p_wallet: wallet, p_plan_code: 'free' },
        { useServiceRole: true },
      )) as unknown as CreateUserRpcResponse;

      this.logger.log(
        result.is_new_user
          ? `New user created with ID: ${result.user_id} and wallet: ${wallet}`
          : `Wallet ${wallet} already exists for user ${result.user_id}`,
      );

      // Intentionally keep wallet connection as a cheap identity bootstrap.
      // Do NOT auto-trigger Alpha/DeBank ETL here: during the current deposit
      // development phase, a newly connected wallet should be able to create
      // its account and use live wallet/deposit flows without paying for a
      // portfolio import. After explicit ownership verification, portfolio
      // features can call triggerWalletDataFetch when that phase is enabled.
      return result;
    }, 'connect wallet');
  }

  async addWallet(
    userId: string,
    wallet: string,
    label: string | undefined,
    signature?: string,
  ): Promise<AddWalletResponse> {
    return this.withErrorHandling(async () => {
      await this.userValidationService.validateUserExists(userId);

      let ownershipVerifiedAt: string | null = null;
      if (signature) {
        const verified =
          await this.walletBindingChallengeService.verifyChallenge(
            userId,
            wallet,
            signature,
          );
        if (!verified) {
          throw new BadRequestException(
            'Wallet ownership signature is invalid, expired, or missing a challenge',
          );
        }
        ownershipVerifiedAt = new Date().toISOString();
      }

      // Let the unique constraint on (wallet) be the source of truth. We skip
      // the pre-check entirely so the happy path is one round-trip — and we
      // close the small TOCTOU window between check-and-insert. The conflict
      // path looks up ownership to keep the differentiated UX message.
      try {
        const newWallet = await this.insertOne<UserCryptoWallet>(
          'user_crypto_wallets',
          {
            user_id: userId,
            wallet,
            label: label ?? generateDefaultWalletLabel(wallet),
            ownership_verified_at: ownershipVerifiedAt,
          },
          { entityName: 'Wallet' },
        );

        return {
          wallet_id: newWallet.id,
          ownership_verified: ownershipVerifiedAt !== null,
          message: ownershipVerifiedAt
            ? 'Wallet added successfully to user bundle'
            : 'Wallet added to user bundle; verify ownership to enable portfolio tracking',
        };
      } catch (error) {
        // SupabaseErrorHandler translates Postgres unique_violation (23505) to
        // ConflictException — only refine the message in that case.
        if (error instanceof ConflictException) {
          const walletValidation =
            await this.userValidationService.validateWalletAvailability(
              wallet,
              userId,
            );
          if (walletValidation.belongsToCurrentUser) {
            throw new ConflictException('Wallet already belongs to this user');
          }
          throw new ConflictException(
            'Wallet already belongs to another user, please delete one of the accounts instead',
          );
        }
        throw error;
      }
    }, 'add wallet');
  }

  async verifyWalletOwnership(
    userId: string,
    walletAddress: string,
    signature: string,
  ): Promise<VerifyWalletResponse> {
    return this.withErrorHandling(async () => {
      await this.userValidationService.validateUserExists(userId);
      const wallets = await this.findMany<
        Pick<UserCryptoWallet, 'wallet' | 'ownership_verified_at'>
      >(
        'user_crypto_wallets',
        { user_id: userId },
        {
          select: 'wallet, ownership_verified_at',
          entityName: 'Wallets',
        },
      );
      const wallet = wallets.find((candidate) =>
        equalsAddress(candidate.wallet, walletAddress),
      );

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.ownership_verified_at) {
        return {
          success: true,
          message: 'Wallet ownership already verified',
          ownership_verified_at: wallet.ownership_verified_at,
        };
      }

      const verified = await this.walletBindingChallengeService.verifyChallenge(
        userId,
        walletAddress,
        signature,
      );
      if (!verified) {
        throw new BadRequestException(
          'Wallet ownership signature is invalid, expired, or missing a challenge',
        );
      }

      const ownershipVerifiedAt = new Date().toISOString();
      await this.updateWhere(
        'user_crypto_wallets',
        { ownership_verified_at: ownershipVerifiedAt },
        { user_id: userId, wallet: wallet.wallet },
        { entityName: 'Wallet', requireSingleResult: true },
      );

      return {
        success: true,
        message: 'Wallet ownership verified successfully',
        ownership_verified_at: ownershipVerifiedAt,
      };
    }, 'verify wallet ownership');
  }

  async requestWalletBindingChallenge(
    userId: string,
    wallet: string,
  ): Promise<WalletBindingChallenge> {
    return this.withErrorHandling(async () => {
      await this.userValidationService.validateUserExists(userId);
      return this.walletBindingChallengeService.issueChallenge(userId, wallet);
    }, 'request wallet binding challenge');
  }

  async requestDeletionChallenge(
    userId: string,
    wallet: string,
  ): Promise<AccountDeletionChallenge> {
    return this.withErrorHandling(async () => {
      await this.validateUserWithVerifiedWallet(userId, wallet);
      return this.accountDeletionChallengeService.issueChallenge(
        userId,
        wallet,
      );
    }, 'request account deletion challenge');
  }

  async updateEmail(
    userId: string,
    email: string,
  ): Promise<UpdateEmailResponse> {
    return this.withErrorHandling(async () => {
      const emailValidation =
        await this.userValidationService.validateEmailAvailability(
          email,
          userId,
        );

      if (!emailValidation.isAvailable) {
        throw new ConflictException('Email already in use by another user');
      }

      await this.updateReportPreferences(
        userId,
        {
          email,
          is_subscribed_to_reports: true,
        },
        true,
      );

      return {
        success: true,
        message: 'Email subscription updated successfully',
        email_updated: true,
        plan_upgraded: false,
      };
    }, 'update email');
  }

  async unsubscribeFromReports(userId: string): Promise<SuccessResponse> {
    return this.withErrorHandling(async () => {
      await this.updateReportPreferences(
        userId,
        { is_subscribed_to_reports: false },
        false,
      );
      return {
        success: true,
        message: 'Successfully unsubscribed from email reports',
      };
    }, 'unsubscribe from reports');
  }

  async unsubscribeFromReportsWithToken(
    token: string,
  ): Promise<SuccessResponse> {
    return this.withErrorHandling(async () => {
      const identity = this.reportUnsubscribeTokenService.verifyToken(token);
      const user = await this.findOne<{ email: string | null }>(
        'users',
        { id: identity.userId },
        {
          select: 'email',
          entityName: 'User',
          throwOnNotFound: false,
          useServiceRole: true,
        },
      );

      if (user?.email?.toLowerCase() !== identity.email.toLowerCase()) {
        throw new BadRequestException('Invalid unsubscribe token');
      }

      await this.updateReportPreferences(
        identity.userId,
        { is_subscribed_to_reports: false },
        true,
      );

      return {
        success: true,
        message: 'Successfully unsubscribed from email reports',
      };
    }, 'unsubscribe from reports');
  }

  private async updateReportPreferences(
    userId: string,
    updates: {
      email?: string;
      is_subscribed_to_reports: boolean;
    },
    useServiceRole: boolean,
  ): Promise<void> {
    await this.updateWhere(
      'users',
      updates,
      { id: userId },
      {
        entityName: 'User',
        requireSingleResult: true,
        useServiceRole,
      },
    );
  }

  async updateWalletLabel(
    userId: string,
    walletAddress: string,
    label: string,
  ): Promise<UpdateWalletLabelResponse> {
    return this.withErrorHandling(async () => {
      await this.userValidationService.validateWalletOwnership(
        walletAddress,
        userId,
      );

      await this.updateWhere(
        'user_crypto_wallets',
        { label },
        { wallet: walletAddress, user_id: userId },
        { entityName: 'Wallet' },
      );

      return {
        success: true,
        message: 'Wallet label updated successfully',
      };
    }, 'update wallet label');
  }

  async getUserWallets(userId: string): Promise<UserCryptoWallet[]> {
    return this.withErrorHandling(
      () =>
        this.findMany<UserCryptoWallet>(
          'user_crypto_wallets',
          { user_id: userId },
          {
            orderBy: { column: 'created_at', ascending: true },
            entityName: 'Wallets',
          },
        ),
      'fetch user wallets',
    );
  }

  async removeWallet(
    userId: string,
    walletId: string,
  ): Promise<{ message: string }> {
    return this.withErrorHandling(async () => {
      const wallet = await this.findOne<{ user_id: string }>(
        'user_crypto_wallets',
        { id: walletId },
        {
          select: 'user_id',
          entityName: 'Wallet',
        },
      );

      if (wallet?.user_id !== userId) {
        throw new BadRequestException('Wallet does not belong to this user');
      }

      await this.deleteWhere(
        'user_crypto_wallets',
        { id: walletId },
        {
          entityName: 'Wallet',
          requireSingleResult: true,
        },
      );

      return { message: 'Wallet removed successfully' };
    }, 'remove wallet');
  }

  async getUserProfile(userId: string): Promise<UserProfileResponse> {
    return this.withErrorHandling(async () => {
      // The three reads are independent — run them in parallel.
      // mustExist throws NotFoundException on missing user, which short-circuits
      // the Promise.all and propagates through withErrorHandling as before.
      // We fetch the full users row directly (instead of going through the
      // narrow validateUserExists) because the profile response needs every
      // column.
      const [user, wallets, subscriptionData] = await Promise.all([
        this.mustExist<UserProfileResponse['user']>(
          'users',
          { id: userId },
          'User',
          '*',
        ),
        this.getUserWallets(userId),
        this.userValidationService.getActiveSubscriptionWithPlan(userId),
      ]);

      const result: UserProfileResponse = {
        user,
        wallets,
      };

      if (subscriptionData) {
        const { plans, ...rest } = subscriptionData;
        result.subscription = {
          ...rest,
          plan: plans,
        };
      }

      return result;
    }, 'fetch user profile');
  }

  async deleteUser(
    userId: string,
    wallet: string,
    signature: string,
  ): Promise<SuccessResponse> {
    return this.withErrorHandling(async () => {
      await this.validateUserWithVerifiedWallet(userId, wallet);

      const verified =
        await this.accountDeletionChallengeService.verifyChallenge(
          userId,
          wallet,
          signature,
        );
      if (!verified) {
        throw new BadRequestException(
          'Account deletion signature is invalid, expired, or missing a challenge',
        );
      }

      // Database cascades release wallets and remove subscriptions,
      // notification settings, tokens, and queued ETL jobs atomically.
      await this.deleteWhere(
        'users',
        { id: userId },
        {
          entityName: 'User',
          requireSingleResult: true,
        },
      );

      return {
        success: true,
        message: 'User deleted successfully',
      };
    }, 'delete user');
  }

  private async validateUserWithVerifiedWallet(
    userId: string,
    wallet: string,
  ): Promise<void> {
    await this.userValidationService.validateUserExists(userId);
    await this.userValidationService.validateVerifiedWalletOwnership(
      wallet,
      userId,
    );
  }

  async triggerWalletDataFetch(
    userId: string,
    walletAddress: string,
  ): Promise<EtlJobResponse> {
    return this.withErrorHandling(async () => {
      this.logger.log(
        `Triggering wallet data fetch for user ${userId}, wallet ${walletAddress}`,
      );

      await Promise.all([
        this.userValidationService.validateUserExists(userId),
        this.userValidationService.validateVerifiedWalletOwnership(
          walletAddress,
          userId,
        ),
      ]);

      this.logger.log(`Validation passed. Calling alpha-etl webhook...`);
      return this.executeWalletDataFetch(userId, walletAddress);
    }, 'trigger wallet data fetch');
  }

  /**
   * Internal: call the alpha-etl webhook after the caller has established that
   * the user owns the wallet. The public triggerWalletDataFetch method performs
   * those validation reads before entering this helper.
   */
  private async executeWalletDataFetch(
    userId: string,
    walletAddress: string,
  ): Promise<EtlJobResponse> {
    const walletPreview = truncateForLog(walletAddress);

    try {
      void this.wakeAlphaEtl();

      const webhookResult = await this.alphaEtlHttpService.triggerWalletFetch(
        userId,
        walletAddress,
      );

      this.logger.log('Alpha-ETL webhook response', {
        jobId: webhookResult.jobId,
        userId,
        walletAddress: walletPreview,
      });

      return {
        job_id: webhookResult.jobId,
        status: 'pending',
        message: 'Wallet data fetch job queued successfully',
        rate_limited: false,
      };
    } catch (error) {
      this.logger.error('Failed to trigger alpha-etl webhook', {
        error: getErrorMessage(error),
        userId,
        walletAddress: walletPreview,
      });

      return this.createFailedEtlJobResponse('Failed to queue ETL job');
    }
  }

  async getEtlJobStatus(jobId: string): Promise<EtlJobStatusApiResponse> {
    return this.withErrorHandling(async () => {
      try {
        // Query alpha-etl HTTP API instead of database
        const jobStatus = await this.alphaEtlHttpService.getJobStatus(jobId);

        return {
          job_id: jobStatus.jobId,
          status: jobStatus.status,
          created_at: jobStatus.createdAt,
          completed_at: jobStatus.completedAt,
          error_message: jobStatus.error?.message,
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('Job not found')) {
          throw new NotFoundException('ETL job not found');
        }
        throw error;
      }
    }, 'get ETL job status');
  }

  async requestTelegramToken(userId: string): Promise<TelegramTokenResponse> {
    return this.withErrorHandling(async () => {
      if (!this.telegramService.isServiceConfigured()) {
        throw new BadRequestException('Telegram integration is not configured');
      }

      await this.userValidationService.validateUserExists(userId);

      const { token, expiresAt } =
        await this.telegramTokenService.generateToken(userId);

      const botName = this.telegramService.getBotName();
      const deepLink = `https://t.me/${botName}?start=${token}`;

      return {
        token,
        botName,
        deepLink,
        expiresAt: expiresAt.toISOString(),
      };
    }, 'request Telegram token');
  }

  async getTelegramStatus(userId: string): Promise<TelegramStatusResponse> {
    return this.withErrorHandling(async () => {
      const settings = await this.findTelegramSettings<{
        is_enabled: boolean;
        created_at: string;
      }>(userId, 'is_enabled, created_at');

      if (!settings) {
        return {
          isConnected: false,
          isEnabled: false,
        };
      }

      return {
        isConnected: true,
        isEnabled: settings.is_enabled,
        connectedAt: settings.created_at,
      };
    }, 'get Telegram status');
  }

  async disconnectTelegram(userId: string): Promise<SuccessResponse> {
    return this.withErrorHandling(async () => {
      const existing = await this.findTelegramSettings<{ user_id: string }>(
        userId,
        'user_id',
      );

      if (!existing) {
        throw new BadRequestException(
          'Telegram is not connected for this user',
        );
      }

      // jscpd:ignore-start
      await this.deleteWhere(
        'notification_settings',
        { user_id: userId, channel_type: CHANNEL_TYPE_TELEGRAM },
        { entityName: 'Telegram settings', useServiceRole: true },
      );
      // jscpd:ignore-end

      this.logger.log(`User ${userId} disconnected Telegram via API`);

      return {
        success: true,
        message: 'Telegram disconnected successfully',
      };
    }, 'disconnect Telegram');
  }

  private async findTelegramSettings<T>(
    userId: string,
    select: string,
  ): Promise<T | null> {
    return this.findOne<T>(
      'notification_settings',
      { user_id: userId, channel_type: CHANNEL_TYPE_TELEGRAM },
      {
        select,
        entityName: 'Telegram settings',
        throwOnNotFound: false,
        useServiceRole: true,
      },
    );
  }

  private createFailedEtlJobResponse(message: string): EtlJobResponse {
    return {
      job_id: null,
      status: 'error',
      message,
      rate_limited: false,
    };
  }

  private async wakeAlphaEtl(): Promise<void> {
    try {
      const healthPassed = await this.alphaEtlHttpService.healthPing();
      if (!healthPassed) {
        this.logger.warn(
          'Alpha-ETL health check failed, proceeding with webhook anyway',
        );
      }
    } catch (error) {
      this.logger.warn(
        'Alpha-ETL health check failed, proceeding with webhook anyway',
        { error: getErrorMessage(error) },
      );
    }
  }
}
