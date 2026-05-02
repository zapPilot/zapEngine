import { CHANNEL_TYPE_TELEGRAM } from '../common/constants';
import { ServiceLayerException } from '../common/exceptions';
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
// EtlJobStatus type from @zapengine/types/etl is used by AlphaEtlHttpService
import { TelegramService } from '../modules/notifications/telegram.service';
import { TelegramTokenService } from '../modules/notifications/telegram-token.service';
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
} from './interfaces';

/**
 * Expected response from create_user_with_wallet_and_plan RPC
 */
interface CreateUserRpcResponse {
  user_id: string;
  is_new_user: boolean;
}

/**
 * Expected response from update_user_email_and_upgrade_plan RPC
 */
interface UpdateEmailRpcResponse {
  success: boolean;
  message: string;
  email_updated: boolean;
  plan_upgraded: boolean;
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

      let etlJob: EtlJobResponse | undefined;

      // For new users: update last_activity_at and auto-trigger ETL
      // (ActivityTrackerInterceptor can't track /connect-wallet since userId isn't in the request)
      if (result.is_new_user) {
        await this.updateWhere(
          'users',
          { last_activity_at: new Date().toISOString() },
          { id: result.user_id },
          { entityName: 'User', useServiceRole: true },
        );

        try {
          etlJob = await this.triggerWalletDataFetch(result.user_id, wallet);

          if (!etlJob.job_id) {
            throw new ServiceLayerException(
              'ETL job creation failed: no job_id returned',
            );
          }

          this.logger.log(`Auto-triggered ETL: job ${etlJob.job_id}`);
        } catch (error) {
          this.logger.warn('Failed to auto-trigger ETL', error);
          etlJob = this.createFailedEtlJobResponse(
            'ETL job could not be queued',
          );
        }
      }

      return {
        ...result,
        etl_job: etlJob,
      };
    }, 'connect wallet');
  }

  async addWallet(
    userId: string,
    wallet: string,
    label?: string,
  ): Promise<AddWalletResponse> {
    return this.withErrorHandling(async () => {
      await this.userValidationService.validateUserExists(userId);

      const walletValidation =
        await this.userValidationService.validateWalletAvailability(
          wallet,
          userId,
        );

      if (!walletValidation.isAvailable) {
        if (walletValidation.belongsToCurrentUser) {
          throw new ConflictException('Wallet already belongs to this user');
        }
        throw new ConflictException(
          'Wallet already belongs to another user, please delete one of the accounts instead',
        );
      }

      const newWallet = await this.insertOne<UserCryptoWallet>(
        'user_crypto_wallets',
        {
          user_id: userId,
          wallet,
          label: label ?? generateDefaultWalletLabel(wallet),
        },
        { entityName: 'Wallet' },
      );

      return {
        wallet_id: newWallet.id,
        message: 'Wallet added successfully to user bundle',
      };
    }, 'add wallet');
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

      const result = (await this.databaseService.rpc(
        'update_user_email_and_upgrade_plan',
        { p_user_id: userId, p_email: email },
        { useServiceRole: true },
      )) as unknown as UpdateEmailRpcResponse;

      return result;
    }, 'update email');
  }

  async unsubscribeFromReports(userId: string): Promise<SuccessResponse> {
    return this.withErrorHandling(async () => {
      await this.updateWhere(
        'users',
        { is_subscribed_to_reports: false },
        { id: userId },
        {
          entityName: 'User',
          requireSingleResult: true,
        },
      );
      return {
        success: true,
        message: 'Successfully unsubscribed from email reports',
      };
    }, 'unsubscribe from reports');
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
      const user = await this.userValidationService.validateUserExists(userId);

      const wallets = await this.getUserWallets(userId);

      const subscriptionData =
        await this.userValidationService.getActiveSubscriptionWithPlan(userId);

      const result: UserProfileResponse = {
        user,
        wallets,
      };

      if (subscriptionData) {
        const { plans, ...rest } =
          subscriptionData as typeof subscriptionData & { plans?: unknown };
        result.subscription = {
          ...rest,
          plan: plans,
        };
      }

      return result;
    }, 'fetch user profile');
  }

  async deleteUser(userId: string): Promise<SuccessResponse> {
    return this.withErrorHandling(async () => {
      await this.userValidationService.validateUserExists(userId);

      const activeSubscription =
        await this.userValidationService.getActiveSubscriptionWithPlan(userId);

      if (activeSubscription) {
        const cancellationTimestamp = new Date().toISOString();

        await this.updateWhere(
          'user_subscriptions',
          {
            is_canceled: true,
            ends_at: cancellationTimestamp,
          },
          {
            user_id: userId,
            is_canceled: false,
          },
          {
            entityName: 'Subscription',
          },
        );
      }

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

  // ETL Job Methods

  async triggerWalletDataFetch(
    userId: string,
    walletAddress: string,
  ): Promise<EtlJobResponse> {
    return this.withErrorHandling(async () => {
      const walletPreview = truncateForLog(walletAddress);
      this.logger.log(
        `Triggering wallet data fetch for user ${userId}, wallet ${walletAddress}`,
      );

      await this.userValidationService.validateUserExists(userId);
      await this.userValidationService.validateWalletOwnership(
        walletAddress,
        userId,
      );

      this.logger.log(`Validation passed. Calling alpha-etl webhook...`);

      try {
        const healthPassed = await this.alphaEtlHttpService.healthPing();

        if (!healthPassed) {
          this.logger.warn(
            'Alpha-ETL health check failed, proceeding with webhook anyway',
          );
        }

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
    }, 'trigger wallet data fetch');
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

  // Telegram Integration Methods

  /**
   * Request a Telegram connection token for a user.
   * Validates service configuration, user existence, generates token, and builds deep link.
   */
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

  /**
   * Get Telegram connection status for a user.
   */
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

  /**
   * Disconnect Telegram notifications for a user.
   */
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

      await this.deleteWhere(
        'notification_settings',
        { user_id: userId, channel_type: CHANNEL_TYPE_TELEGRAM },
        { entityName: 'Telegram settings', useServiceRole: true },
      );

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
}
