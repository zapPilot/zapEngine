import { ServiceLayerException } from '../../../src/common/exceptions';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../src/common/http';
import { AlphaEtlHttpService } from '../../../src/common/services';
import { DatabaseService } from '../../../src/database/database.service';
import { UserValidationService } from '../../../src/database/user-validation.service';
import { ReportUnsubscribeTokenService } from '../../../src/modules/notifications/report-unsubscribe-token.service';
import { TelegramService } from '../../../src/modules/notifications/telegram.service';
import { TelegramTokenService } from '../../../src/modules/notifications/telegram-token.service';
import { UsersService } from '../../../src/users/users.service';
import { createMockDatabaseService } from '../../test-utils';

function createMocks() {
  const dbMock = createMockDatabaseService();

  const validationService = {
    validateUserExists: vi
      .fn()
      .mockResolvedValue({ id: 'user-1', email: 'test@test.com' }),
    validateWalletOwnership: vi
      .fn()
      .mockResolvedValue({ id: 'w-1', wallet: '0x1234', user_id: 'user-1' }),
    validateVerifiedWalletOwnership: vi.fn().mockResolvedValue({
      id: 'w-1',
      ownership_verified_at: '2026-08-22T00:00:00.000Z',
    }),
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

  const accountAuthService = {
    authenticate: vi.fn().mockResolvedValue({
      user_id: 'user-1',
      created_at: new Date().toISOString(),
    }),
    verifyDeletion: vi.fn().mockResolvedValue(undefined),
  };

  const reportUnsubscribeTokenService = {
    verifyToken: vi.fn().mockReturnValue({
      v: 1,
      userId: 'user-1',
      email: 'test@test.com',
    }),
  };

  const service = new UsersService(
    dbMock.mock as unknown as DatabaseService,
    validationService as unknown as UserValidationService,
    alphaEtlHttpService as unknown as AlphaEtlHttpService,
    telegramService as unknown as TelegramService,
    telegramTokenService as unknown as TelegramTokenService,
    accountAuthService as never,
    reportUnsubscribeTokenService as unknown as ReportUnsubscribeTokenService,
  );

  return {
    service,
    dbMock,
    validationService,
    alphaEtlHttpService,
    telegramService,
    telegramTokenService,
    accountAuthService,
    reportUnsubscribeTokenService,
    qb: dbMock.supabase.queryBuilder,
  };
}

describe('UsersService', () => {
  // -----------------------------------------------------------------------
  // getUserByWallet
  // -----------------------------------------------------------------------
  describe('getUserByWallet', () => {
    it('ranks owners above founders and legacy verified watch entries', async () => {
      const { service, qb } = createMocks();
      const entry = (
        id: string,
        role: string,
        created_at = '2026-01-01T00:00:00Z',
      ) => ({
        id,
        label: null,
        last_portfolio_update_at: null,
        user_id: id,
        wallet: '0xabc',
        created_at,
        owner_bound_at: role === 'owner' ? created_at : null,
        ownership_verified_at: role === 'verified' ? created_at : null,
        users: {
          created_at: role === 'founder' ? created_at : '2025-01-01T00:00:00Z',
        },
      });
      const candidates = [
        entry('watch', 'watch'),
        entry('verified', 'verified'),
        entry('founder', 'founder'),
        entry('z-owner', 'owner'),
        entry('a-owner', 'owner'),
        entry('late-owner', 'owner', '2026-02-01T00:00:00Z'),
      ];
      qb.mockResolvedThen({ data: candidates, error: null });
      vi.spyOn(service, 'getUserWallets').mockImplementation(async (id) =>
        candidates.filter((w) => w.user_id === id),
      );
      await expect(service.getUserByWallet('0xabc')).resolves.toEqual({
        user_id: 'a-owner',
      });
      qb.mockResolvedThen({ data: [candidates[0]], error: null });
      await expect(
        service.getUserByWallet('0xabc', { verifiedOnly: true }),
      ).rejects.toThrow('Portfolio not found');
      qb.mockResolvedThen({ data: null, error: null });
      await expect(service.getUserByWallet('0xabc')).rejects.toThrow(
        'Portfolio not found',
      );
    });
    it('propagates errors from either lookup stage', async () => {
      for (const stage of [0, 1]) {
        const { service, qb } = createMocks();
        let calls = 0;
        qb.then.mockImplementation((resolve?: (value: unknown) => unknown) =>
          Promise.resolve(
            resolve?.({
              data: [],
              error: calls++ === stage ? { message: 'lookup failed' } : null,
            }),
          ),
        );
        await expect(service.getUserByWallet('0xabc')).rejects.toThrow(
          'Failed to fetch user by wallet',
        );
      }
    });
    it('resolves mixed-case verified wallets without bootstrapping', async () => {
      const { service, qb, dbMock } = createMocks();
      const candidate = {
        id: 'w',
        user_id: 'user-1',
        wallet: '0xAbC',
        created_at: '2026-01-01T00:00:00Z',
        owner_bound_at: null,
        ownership_verified_at: null,
        users: { created_at: '2026-01-01T00:00:00Z' },
      };
      qb.mockResolvedThen({ data: [candidate], error: null });
      await expect(
        service.getUserByWallet('0xabc', { verifiedOnly: true }),
      ).resolves.toEqual({ user_id: 'user-1' });
      expect(qb.ilike).toHaveBeenCalledWith('wallet', '0xabc');
      expect(dbMock.mock.rpc).not.toHaveBeenCalled();
    });
  });

  describe('connectWallet', () => {
    it('creates a new user without triggering portfolio ETL', async () => {
      const { service, dbMock, alphaEtlHttpService } = createMocks();
      dbMock.mock.rpc.mockResolvedValue({
        user_id: 'user-1',
        is_new_user: true,
      });

      const result = await service.connectWallet(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(dbMock.mock.rpc).toHaveBeenCalledExactlyOnceWith(
        'create_user_with_wallet_and_plan',
        {
          p_wallet: '0x1234567890abcdef1234567890abcdef12345678',
          p_plan_code: 'free',
        },
      );
      expect(result.user_id).toBe('user-1');
      expect(result.is_new_user).toBe(true);
      expect(result.etl_job).toBeUndefined();
      expect(alphaEtlHttpService.healthPing).not.toHaveBeenCalled();
      expect(alphaEtlHttpService.triggerWalletFetch).not.toHaveBeenCalled();
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

      expect(dbMock.mock.rpc).toHaveBeenCalledWith(
        'create_user_with_wallet_and_plan',
        {
          p_wallet: '0x1234567890abcdef1234567890abcdef12345678',
          p_plan_code: 'free',
        },
      );
      expect(result.is_new_user).toBe(false);
      expect(result.etl_job).toBeUndefined();
      expect(alphaEtlHttpService.triggerWalletFetch).not.toHaveBeenCalled();
    });

    it('keeps account bootstrap independent from ETL availability', async () => {
      const { service, dbMock, alphaEtlHttpService } = createMocks();
      dbMock.mock.rpc.mockResolvedValue({
        user_id: 'user-1',
        is_new_user: true,
      });
      alphaEtlHttpService.triggerWalletFetch.mockRejectedValue(
        new Error('ETL down'),
      );

      const result = await service.connectWallet(
        '0x1234567890abcdef1234567890abcdef12345678',
      );

      expect(result.user_id).toBe('user-1');
      expect(result.etl_job).toBeUndefined();
      expect(alphaEtlHttpService.triggerWalletFetch).not.toHaveBeenCalled();
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
    it('adds an unverified wallet without consuming a challenge', async () => {
      const { service, qb, accountAuthService } = createMocks();
      qb.single.mockResolvedValue({
        data: { id: 'w-new', user_id: 'user-1', wallet: '0x123' },
        error: null,
      });

      const result = await service.addWallet('user-1', '0x123', 'My Wallet');

      expect(result).toMatchObject({
        wallet_id: 'w-new',
        ownership_verified: false,
        message:
          'Wallet added to user bundle; verify ownership to enable portfolio tracking',
      });
      expect(qb.insert).toHaveBeenCalledWith(
        expect.objectContaining({ ownership_verified_at: null }),
      );
      expect(accountAuthService.verifyDeletion).not.toHaveBeenCalled();
    });
    it('adds wallet to existing user', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: { id: 'w-new', user_id: 'user-1', wallet: '0x123' },
        error: null,
      });

      const result = await service.addWallet('user-1', '0x123', 'My Wallet');

      expect(result.wallet_id).toBe('w-new');
      expect(result.message).toContain('Wallet added');
      expect(result.ownership_verified).toBe(false);
    });

    it('throws ConflictException when wallet belongs to current user', async () => {
      const { service, qb, validationService } = createMocks();
      // insertOne fires PG unique-violation (23505) → ConflictException
      qb.single.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      });
      // Post-conflict ownership lookup says "you already own it"
      validationService.validateWalletAvailability.mockResolvedValue({
        isAvailable: false,
        belongsToCurrentUser: true,
      });

      await expect(
        service.addWallet('user-1', '0x123', undefined),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when wallet belongs to another user', async () => {
      const { service, qb, validationService } = createMocks();
      qb.single.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      });
      validationService.validateWalletAvailability.mockResolvedValue({
        isAvailable: false,
        belongsToCurrentUser: false,
      });

      await expect(
        service.addWallet('user-1', '0x123', undefined),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows non-conflict wallet insert failures without consulting wallet availability', async () => {
      // Locks: addWallet `if (error instanceof ConflictException)` false and
      // `throw error` — a non-unique-violation insert failure must not be
      // reinterpreted as a wallet conflict.
      const { service, qb, validationService } = createMocks();
      const cause = new Error('db-down');
      qb.single.mockRejectedValue(cause);

      try {
        await service.addWallet('user-1', '0x123', undefined);
        expect.unreachable('expected addWallet to reject on insert failure');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceLayerException);
        expect((error as ServiceLayerException).message).toContain(
          'Failed to add wallet',
        );
        expect((error as ServiceLayerException).cause).toBe(cause);
      }
      expect(qb.insert).toHaveBeenCalled();
      expect(
        validationService.validateWalletAvailability,
      ).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, validationService } = createMocks();
      validationService.validateUserExists.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        service.addWallet('user-1', '0x123', undefined),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // requestWalletBindingChallenge
  // -----------------------------------------------------------------------
  describe('updateEmail', () => {
    it('updates email successfully', async () => {
      const { service, dbMock, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: { id: 'user-1' },
        error: null,
      });

      const result = await service.updateEmail('user-1', 'new@test.com');

      expect(result.success).toBe(true);
      expect(result.email_updated).toBe(true);
      expect(result.plan_upgraded).toBe(false);
      expect(dbMock.mock.rpc).not.toHaveBeenCalled();
      expect(qb.update).toHaveBeenCalledWith({
        email: 'new@test.com',
        is_subscribed_to_reports: true,
      });
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

  describe('unsubscribeFromReportsWithToken', () => {
    it('unsubscribes the matching email using the service-role client', async () => {
      const { service, qb } = createMocks();
      qb.single
        .mockResolvedValueOnce({
          data: { email: 'test@test.com' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: 'user-1' },
          error: null,
        });

      const result =
        await service.unsubscribeFromReportsWithToken('signed-token');

      expect(result.success).toBe(true);
      expect(qb.update).toHaveBeenCalledWith({
        is_subscribed_to_reports: false,
      });
    });

    it('rejects a token when the current email no longer matches', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: { email: 'changed@test.com' },
        error: null,
      });

      await expect(
        service.unsubscribeFromReportsWithToken('signed-token'),
      ).rejects.toThrow(BadRequestException);
      expect(qb.update).not.toHaveBeenCalled();
    });

    it('rejects a token when the user no longer exists', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(
        service.unsubscribeFromReportsWithToken('signed-token'),
      ).rejects.toThrow(BadRequestException);
      expect(qb.update).not.toHaveBeenCalled();
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
    it('uses atomic database removal with the session age', async () => {
      const { service, dbMock } = createMocks();
      await expect(
        service.removeWallet('user-1', 'w-1', 'token'),
      ).resolves.toEqual({ message: 'Wallet removed successfully' });
      expect(dbMock.supabase.client.rpc).toHaveBeenCalledWith(
        'remove_bundle_wallet',
        { p_user_id: 'user-1', p_wallet_id: 'w-1', p_recent: true },
      );
    });
    it.each([
      ['RECENT_SIGN_IN_REQUIRED', 401],
      ['LAST_OWNER_WALLET', 409],
      ['missing wallet', 400],
    ])('rejects %s', async (message, statusCode) => {
      const { service, dbMock } = createMocks();
      dbMock.supabase.client.rpc.mockResolvedValue({
        data: null,
        error: { message },
      });
      await expect(
        service.removeWallet('user-1', 'w-1', 'token'),
      ).rejects.toMatchObject({ statusCode });
    });
  });

  describe('getUserProfile', () => {
    it('returns profile with wallets and no subscription', async () => {
      const { service, qb } = createMocks();
      // getUserProfile now fetches the full users row via mustExist (qb.single),
      // not via validationService.
      qb.single.mockResolvedValue({
        data: { id: 'user-1', email: 'test@test.com' },
        error: null,
      });
      qb.mockResolvedThen({
        data: [{ id: 'w-1', wallet: '0x111' }],
        error: null,
      });

      const result = await service.getUserProfile('user-1');

      expect(result.user).toEqual({
        id: 'user-1',
        created_at: undefined,
        is_subscribed_to_reports: undefined,
      });
      expect(result.user).not.toHaveProperty('email');
      expect(result.wallets).toEqual([{ id: 'w-1', wallet: '0x111' }]);
      expect(result.subscription).toBeUndefined();
    });

    it('includes subscription when active', async () => {
      const { service, qb, validationService } = createMocks();
      qb.single.mockResolvedValue({
        data: { id: 'user-1', email: 'test@test.com' },
        error: null,
      });
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
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await expect(service.getUserProfile('user-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // deleteUser
  // -----------------------------------------------------------------------
  describe('deleteUser', () => {
    it('verifies a purpose-specific owner proof before deleting with cascades', async () => {
      const { service, qb, accountAuthService } = createMocks();
      qb.single.mockResolvedValue({ data: { id: 'user-1' }, error: null });
      await expect(
        service.deleteUser('user-1', 'challenge', 'signature'),
      ).resolves.toMatchObject({ success: true });
      expect(accountAuthService.verifyDeletion).toHaveBeenCalledWith(
        'user-1',
        'challenge',
        'signature',
      );
      expect(qb.delete).toHaveBeenCalledTimes(1);
    });
    it('does not delete after a rejected ownership proof', async () => {
      const { service, qb, accountAuthService } = createMocks();
      accountAuthService.verifyDeletion.mockRejectedValue(
        new BadRequestException('Invalid proof'),
      );
      await expect(
        service.deleteUser('user-1', 'challenge', 'signature'),
      ).rejects.toThrow(BadRequestException);
      expect(qb.delete).not.toHaveBeenCalled();
    });
  });

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

    it('still queues the ETL job when the alpha-etl health ping rejects', async () => {
      // Locks: wakeAlphaEtl catch — a rejecting healthPing warns and the
      // webhook proceeds anyway. wakeAlphaEtl runs fire-and-forget, so wait
      // for the warn before asserting.
      const { service, alphaEtlHttpService } = createMocks();
      alphaEtlHttpService.healthPing.mockRejectedValue(new Error('etl-down'));
      const logger = (
        service as unknown as {
          logger: { warn: (...args: unknown[]) => void };
        }
      ).logger;
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      try {
        const result = await service.triggerWalletDataFetch(
          'user-1',
          '0x1234567890abcdef1234567890abcdef12345678',
        );

        expect(result.job_id).toBe('etl-1');
        expect(result.status).toBe('pending');
        await vi.waitFor(() => {
          expect(warnSpy).toHaveBeenCalledWith(
            'Alpha-ETL health check failed, proceeding with webhook anyway',
            expect.objectContaining({ error: 'etl-down' }),
          );
        });
      } finally {
        warnSpy.mockRestore();
      }
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

    it('rejects an unverified wallet without calling alpha-etl', async () => {
      const { service, validationService, alphaEtlHttpService } = createMocks();
      validationService.validateVerifiedWalletOwnership.mockRejectedValue(
        new ConflictException('Wallet ownership has not been verified'),
      );

      await expect(
        service.triggerWalletDataFetch(
          'user-1',
          '0x1234567890abcdef1234567890abcdef12345678',
        ),
      ).rejects.toThrow(ConflictException);
      expect(alphaEtlHttpService.triggerWalletFetch).not.toHaveBeenCalled();
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
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: { is_enabled: true, created_at: '2026-01-01' },
        error: null,
      });

      const result = await service.getTelegramStatus('user-1');

      expect(result.isConnected).toBe(true);
      expect(result.isEnabled).toBe(true);
      expect(result.connectedAt).toBe('2026-01-01');
    });

    it('returns not connected when no settings', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
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
      const { service, qb } = createMocks();
      // findTelegramSettings returns existing settings
      qb.single.mockResolvedValueOnce({
        data: { user_id: 'user-1' },
        error: null,
      });
      // deleteWhere succeeds
      qb.mockResolvedThen({ data: null, error: null });

      const result = await service.disconnectTelegram('user-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('disconnected');
    });

    it('throws BadRequestException when not connected', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await expect(service.disconnectTelegram('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
