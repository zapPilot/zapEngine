import { ServiceLayerException } from '@common/exceptions';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@common/http';
import { AlphaEtlHttpService } from '@common/services';
import { DatabaseService } from '@database/database.service';
import { UserValidationService } from '@database/user-validation.service';
import { TelegramService } from '@modules/notifications/telegram.service';
import { TelegramTokenService } from '@modules/notifications/telegram-token.service';
import { createMockDatabaseService } from '@test-utils';
import { UsersService } from '@users/users.service';

function createMocks() {
  const dbMock = createMockDatabaseService();

  const validationService = {
    validateUserExists: vi
      .fn()
      .mockResolvedValue({ id: 'user-1', email: 'test@test.com' }),
    validateWalletOwnership: vi
      .fn()
      .mockResolvedValue({ id: 'w-1', wallet: '0x1234', user_id: 'user-1' }),
    validateWalletAvailability: vi
      .fn()
      .mockResolvedValue({ isAvailable: true }),
    validateEmailAvailability: vi.fn().mockResolvedValue({ isAvailable: true }),
    getActiveSubscriptionWithPlan: vi.fn().mockResolvedValue(null),
  };

  const alphaEtlHttpService = {
    healthPing: vi.fn().mockResolvedValue(true),
    triggerWalletFetch: vi.fn().mockResolvedValue({ jobId: 'etl-1' }),
    getJobStatus: vi.fn().mockResolvedValue({
      jobId: 'etl-1',
      status: 'completed',
      createdAt: '2026-01-01',
      completedAt: '2026-01-01',
      error: null,
    }),
  };

  const telegramService = {
    isServiceConfigured: vi.fn().mockReturnValue(true),
    getBotName: vi.fn().mockReturnValue('test_bot'),
  };

  const telegramTokenService = {
    generateToken: vi.fn().mockResolvedValue({
      token: 'tok-123',
      expiresAt: new Date('2026-01-02'),
    }),
  };

  const service = new UsersService(
    dbMock.mock as unknown as DatabaseService,
    validationService as unknown as UserValidationService,
    alphaEtlHttpService as unknown as AlphaEtlHttpService,
    telegramService as unknown as TelegramService,
    telegramTokenService as unknown as TelegramTokenService,
  );

  return {
    service,
    dbMock,
    validationService,
    alphaEtlHttpService,
    telegramService,
    telegramTokenService,
    qb: dbMock.anon.queryBuilder,
    srQb: dbMock.serviceRole.queryBuilder,
  };
}

describe('UsersService', () => {
  // -----------------------------------------------------------------------
  // connectWallet
  // -----------------------------------------------------------------------
  describe('connectWallet', () => {
    it('creates new user and triggers ETL', async () => {
      const { service, dbMock } = createMocks();
      dbMock.mock.rpc.mockResolvedValue({
        user_id: 'user-1',
        is_new_user: true,
      });
      // updateWhere for last_activity_at (uses serviceRole)
      dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
        data: { id: 'user-1' },
        error: null,
      });

      const result = await service.connectWallet(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result.user_id).toBe('user-1');
      expect(result.is_new_user).toBe(true);
      expect(result.etl_job).toBeDefined();
      expect(result.etl_job?.job_id).toBe('etl-1');
    });

    it('returns existing user without triggering ETL', async () => {
      const { service, dbMock, alphaEtlHttpService } = createMocks();
      dbMock.mock.rpc.mockResolvedValue({
        user_id: 'user-1',
        is_new_user: false,
      });

      const result = await service.connectWallet(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result.is_new_user).toBe(false);
      expect(result.etl_job).toBeUndefined();
      expect(alphaEtlHttpService.triggerWalletFetch).not.toHaveBeenCalled();
    });

    it('handles ETL failure gracefully for new user', async () => {
      const { service, dbMock, alphaEtlHttpService } = createMocks();
      dbMock.mock.rpc.mockResolvedValue({
        user_id: 'user-1',
        is_new_user: true,
      });
      dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
        data: { id: 'user-1' },
        error: null,
      });
      alphaEtlHttpService.triggerWalletFetch.mockRejectedValue(
        new Error('ETL down'),
      );

      const result = await service.connectWallet(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result.etl_job?.status).toBe('error');
      expect(result.etl_job?.message).toBe('ETL job could not be queued');
    });

    it('wraps RPC failure in ServiceLayerException', async () => {
      const { service, dbMock } = createMocks();
      dbMock.mock.rpc.mockRejectedValue(new Error('RPC timeout'));

      await expect(
        service.connectWallet('0x1234567890abcdef1234567890abcdef12345678'),
      ).rejects.toThrow(ServiceLayerException);
    });
  });

  // -----------------------------------------------------------------------
  // addWallet
  // -----------------------------------------------------------------------
  describe('addWallet', () => {
    it('adds wallet to existing user', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: { id: 'w-new', user_id: 'user-1', wallet: '0x123' },
        error: null,
      });

      const result = await service.addWallet('user-1', '0x123', 'My Wallet');

      expect(result.wallet_id).toBe('w-new');
      expect(result.message).toContain('Wallet added');
    });

    it('throws ConflictException when wallet belongs to current user', async () => {
      const { service, validationService } = createMocks();
      validationService.validateWalletAvailability.mockResolvedValue({
        isAvailable: false,
        belongsToCurrentUser: true,
      });

      await expect(service.addWallet('user-1', '0x123')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when wallet belongs to another user', async () => {
      const { service, validationService } = createMocks();
      validationService.validateWalletAvailability.mockResolvedValue({
        isAvailable: false,
        belongsToCurrentUser: false,
      });

      await expect(service.addWallet('user-1', '0x123')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, validationService } = createMocks();
      validationService.validateUserExists.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(service.addWallet('user-1', '0x123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // updateEmail
  // -----------------------------------------------------------------------
  describe('updateEmail', () => {
    it('updates email successfully', async () => {
      const { service, dbMock } = createMocks();
      dbMock.mock.rpc.mockResolvedValue({
        success: true,
        message: 'Email updated',
        email_updated: true,
        plan_upgraded: false,
      });

      const result = await service.updateEmail('user-1', 'new@test.com');

      expect(result.success).toBe(true);
    });

    it('throws ConflictException when email already in use', async () => {
      const { service, validationService } = createMocks();
      validationService.validateEmailAvailability.mockResolvedValue({
        isAvailable: false,
      });

      await expect(
        service.updateEmail('user-1', 'taken@test.com'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -----------------------------------------------------------------------
  // unsubscribeFromReports
  // -----------------------------------------------------------------------
  describe('unsubscribeFromReports', () => {
    it('unsubscribes user successfully', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({ data: { id: 'user-1' }, error: null });

      const result = await service.unsubscribeFromReports('user-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('unsubscribed');
    });
  });

  // -----------------------------------------------------------------------
  // updateWalletLabel
  // -----------------------------------------------------------------------
  describe('updateWalletLabel', () => {
    it('updates wallet label successfully', async () => {
      const { service, qb } = createMocks();
      qb.mockResolvedThen({ data: [{ id: 'w-1' }], error: null });

      const result = await service.updateWalletLabel(
        'user-1',
        '0x123',
        'New Label',
      );

      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when wallet does not belong to user', async () => {
      const { service, validationService } = createMocks();
      validationService.validateWalletOwnership.mockRejectedValue(
        new NotFoundException('Wallet not found'),
      );

      await expect(
        service.updateWalletLabel('user-1', '0x123', 'Label'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // getUserWallets
  // -----------------------------------------------------------------------
  describe('getUserWallets', () => {
    it('returns array of wallets', async () => {
      const wallets = [
        { id: 'w-1', wallet: '0x111', user_id: 'user-1' },
        { id: 'w-2', wallet: '0x222', user_id: 'user-1' },
      ];
      const { service, qb } = createMocks();
      qb.mockResolvedThen({ data: wallets, error: null });

      const result = await service.getUserWallets('user-1');
      expect(result).toEqual(wallets);
    });

    it('returns empty array when no wallets exist', async () => {
      const { service, qb } = createMocks();
      qb.mockResolvedThen({ data: null, error: null });

      const result = await service.getUserWallets('user-1');
      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // removeWallet
  // -----------------------------------------------------------------------
  describe('removeWallet', () => {
    it('removes wallet owned by user', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      qb.single.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.removeWallet('user-1', 'w-1');
      expect(result.message).toContain('removed');
    });

    it('throws BadRequestException when wallet belongs to another user', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: { user_id: 'user-2' },
        error: null,
      });

      await expect(service.removeWallet('user-1', 'w-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await expect(service.removeWallet('user-1', 'w-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getUserProfile
  // -----------------------------------------------------------------------
  describe('getUserProfile', () => {
    it('returns profile with wallets and no subscription', async () => {
      const { service, qb } = createMocks();
      qb.mockResolvedThen({
        data: [{ id: 'w-1', wallet: '0x111' }],
        error: null,
      });

      const result = await service.getUserProfile('user-1');

      expect(result.user).toEqual({ id: 'user-1', email: 'test@test.com' });
      expect(result.wallets).toEqual([{ id: 'w-1', wallet: '0x111' }]);
      expect(result.subscription).toBeUndefined();
    });

    it('includes subscription when active', async () => {
      const { service, qb, validationService } = createMocks();
      qb.mockResolvedThen({ data: [], error: null });
      validationService.getActiveSubscriptionWithPlan.mockResolvedValue({
        id: 'sub-1',
        plans: { code: 'vip', name: 'VIP', tier: 1 },
      });

      const result = await service.getUserProfile('user-1');

      expect(result.subscription).toBeDefined();
      expect(result.subscription?.plan).toEqual({
        code: 'vip',
        name: 'VIP',
        tier: 1,
      });
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, validationService } = createMocks();
      validationService.validateUserExists.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(service.getUserProfile('user-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // deleteUser
  // -----------------------------------------------------------------------
  describe('deleteUser', () => {
    it('deletes user without subscription', async () => {
      const { service, qb } = createMocks();
      // deleteWhere for users
      qb.single.mockResolvedValue({ data: null, error: null });

      const result = await service.deleteUser('user-1');
      expect(result.success).toBe(true);
    });

    it('cancels subscription before deleting user', async () => {
      const { service, qb, validationService } = createMocks();
      validationService.getActiveSubscriptionWithPlan.mockResolvedValue({
        id: 'sub-1',
        is_canceled: false,
      });
      // updateWhere for subscription cancellation
      qb.mockResolvedThen({ data: [{ id: 'sub-1' }], error: null });
      // deleteWhere for user
      qb.single.mockResolvedValue({ data: null, error: null });

      const result = await service.deleteUser('user-1');
      expect(result.success).toBe(true);
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, validationService } = createMocks();
      validationService.validateUserExists.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(service.deleteUser('user-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // triggerWalletDataFetch
  // -----------------------------------------------------------------------
  describe('triggerWalletDataFetch', () => {
    it('triggers ETL job successfully', async () => {
      const { service } = createMocks();

      const result = await service.triggerWalletDataFetch(
        'user-1',
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result.job_id).toBe('etl-1');
      expect(result.status).toBe('pending');
      expect(result.rate_limited).toBe(false);
    });

    it('returns error response when webhook fails', async () => {
      const { service, alphaEtlHttpService } = createMocks();
      alphaEtlHttpService.triggerWalletFetch.mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await service.triggerWalletDataFetch(
        'user-1',
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result.job_id).toBeNull();
      expect(result.status).toBe('error');
    });

    it('proceeds when health ping fails', async () => {
      const { service, alphaEtlHttpService } = createMocks();
      alphaEtlHttpService.healthPing.mockResolvedValue(false);

      const result = await service.triggerWalletDataFetch(
        'user-1',
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result.job_id).toBe('etl-1');
    });

    it('throws when user validation fails', async () => {
      const { service, validationService } = createMocks();
      validationService.validateUserExists.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        service.triggerWalletDataFetch(
          'user-999',
          '0x1234567890abcdef1234567890abcdef12345678',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // getEtlJobStatus
  // -----------------------------------------------------------------------
  describe('getEtlJobStatus', () => {
    it('returns job status', async () => {
      const { service } = createMocks();

      const result = await service.getEtlJobStatus('etl-1');

      expect(result.job_id).toBe('etl-1');
      expect(result.status).toBe('completed');
    });

    it('throws NotFoundException when job not found', async () => {
      const { service, alphaEtlHttpService } = createMocks();
      alphaEtlHttpService.getJobStatus.mockRejectedValue(
        new Error('Job not found: etl-999'),
      );

      await expect(service.getEtlJobStatus('etl-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('wraps non-"Job not found" errors in ServiceLayerException', async () => {
      const { service, alphaEtlHttpService } = createMocks();
      alphaEtlHttpService.getJobStatus.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(service.getEtlJobStatus('etl-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // requestTelegramToken
  // -----------------------------------------------------------------------
  describe('requestTelegramToken', () => {
    it('returns token with deep link', async () => {
      const { service } = createMocks();

      const result = await service.requestTelegramToken('user-1');

      expect(result.token).toBe('tok-123');
      expect(result.botName).toBe('test_bot');
      expect(result.deepLink).toBe('https://t.me/test_bot?start=tok-123');
      expect(result.expiresAt).toBeDefined();
    });

    it('throws BadRequestException when Telegram not configured', async () => {
      const { service, telegramService } = createMocks();
      telegramService.isServiceConfigured.mockReturnValue(false);

      await expect(service.requestTelegramToken('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, validationService } = createMocks();
      validationService.validateUserExists.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(service.requestTelegramToken('user-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getTelegramStatus
  // -----------------------------------------------------------------------
  describe('getTelegramStatus', () => {
    it('returns connected status', async () => {
      const { service, srQb } = createMocks();
      srQb.single.mockResolvedValue({
        data: { is_enabled: true, created_at: '2026-01-01' },
        error: null,
      });

      const result = await service.getTelegramStatus('user-1');

      expect(result.isConnected).toBe(true);
      expect(result.isEnabled).toBe(true);
      expect(result.connectedAt).toBe('2026-01-01');
    });

    it('returns not connected when no settings', async () => {
      const { service, srQb } = createMocks();
      srQb.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const result = await service.getTelegramStatus('user-1');

      expect(result.isConnected).toBe(false);
      expect(result.isEnabled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // disconnectTelegram
  // -----------------------------------------------------------------------
  describe('disconnectTelegram', () => {
    it('disconnects successfully', async () => {
      const { service, srQb } = createMocks();
      // findTelegramSettings returns existing settings
      srQb.single.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      // deleteWhere succeeds
      srQb.mockResolvedThen({ data: null, error: null });

      const result = await service.disconnectTelegram('user-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('disconnected');
    });

    it('throws BadRequestException when not connected', async () => {
      const { service, srQb } = createMocks();
      srQb.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await expect(service.disconnectTelegram('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
