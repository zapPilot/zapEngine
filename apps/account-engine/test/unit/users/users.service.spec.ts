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

  const walletBindingChallengeService = {
    issueChallenge: vi.fn().mockReturnValue({
      nonce: 'a'.repeat(64),
      message: 'ZapPilot wallet ownership proof',
      expiresAt: '2026-01-01T00:05:00.000Z',
    }),
    verifyChallenge: vi.fn().mockResolvedValue(true),
  };

  const accountDeletionChallengeService = {
    issueChallenge: vi.fn().mockReturnValue({
      nonce: 'b'.repeat(64),
      message: 'Zap Pilot Account Deletion',
      expiresAt: '2026-01-01T00:05:00.000Z',
    }),
    verifyChallenge: vi.fn().mockResolvedValue(true),
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
    walletBindingChallengeService,
    accountDeletionChallengeService,
    reportUnsubscribeTokenService as unknown as ReportUnsubscribeTokenService,
  );

  return {
    service,
    dbMock,
    validationService,
    alphaEtlHttpService,
    telegramService,
    telegramTokenService,
    walletBindingChallengeService,
    accountDeletionChallengeService,
    reportUnsubscribeTokenService,
    qb: dbMock.anon.queryBuilder,
    srQb: dbMock.serviceRole.queryBuilder,
  };
}

describe('UsersService', () => {
  // -----------------------------------------------------------------------
  // connectWallet
  // -----------------------------------------------------------------------
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
      const { service, qb, walletBindingChallengeService } = createMocks();
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
      expect(
        walletBindingChallengeService.verifyChallenge,
      ).not.toHaveBeenCalled();
    });
    it('adds wallet to existing user', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({
        data: { id: 'w-new', user_id: 'user-1', wallet: '0x123' },
        error: null,
      });

      const result = await service.addWallet(
        'user-1',
        '0x123',
        'My Wallet',
        '0x' + 'ab'.repeat(65),
      );

      expect(result.wallet_id).toBe('w-new');
      expect(result.message).toContain('Wallet added');
      expect(result.ownership_verified).toBe(true);
    });

    it('marks the wallet ownership-verified when a valid signature is provided', async () => {
      const { service, qb, walletBindingChallengeService } = createMocks();
      qb.single.mockResolvedValue({
        data: { id: 'w-new', user_id: 'user-1', wallet: '0x123' },
        error: null,
      });

      const result = await service.addWallet(
        'user-1',
        '0x123',
        'My Wallet',
        '0x' + 'ab'.repeat(65),
      );

      expect(
        walletBindingChallengeService.verifyChallenge,
      ).toHaveBeenCalledWith('user-1', '0x123', '0x' + 'ab'.repeat(65));
      expect(result.ownership_verified).toBe(true);
      expect(qb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ownership_verified_at: expect.any(String),
        }),
      );
    });

    it('rejects the binding when the ownership signature is invalid', async () => {
      const { service, qb, walletBindingChallengeService } = createMocks();
      walletBindingChallengeService.verifyChallenge.mockResolvedValue(false);

      await expect(
        service.addWallet('user-1', '0x123', undefined, '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow(BadRequestException);
      expect(qb.insert).not.toHaveBeenCalled();
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
        service.addWallet('user-1', '0x123', undefined, '0x' + 'ab'.repeat(65)),
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
        service.addWallet('user-1', '0x123', undefined, '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, validationService } = createMocks();
      validationService.validateUserExists.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        service.addWallet('user-1', '0x123', undefined, '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // requestWalletBindingChallenge
  // -----------------------------------------------------------------------
  describe('requestWalletBindingChallenge', () => {
    it('issues a challenge for an existing user', async () => {
      const { service, walletBindingChallengeService } = createMocks();

      const result = await service.requestWalletBindingChallenge(
        'user-1',
        '0x123',
      );

      expect(walletBindingChallengeService.issueChallenge).toHaveBeenCalledWith(
        'user-1',
        '0x123',
      );
      expect(result.nonce).toHaveLength(64);
      expect(result.message).toContain('ZapPilot');
    });

    it('rejects the challenge request for a missing user', async () => {
      const { service, validationService, walletBindingChallengeService } =
        createMocks();
      validationService.validateUserExists.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        service.requestWalletBindingChallenge('user-1', '0x123'),
      ).rejects.toThrow(NotFoundException);
      expect(
        walletBindingChallengeService.issueChallenge,
      ).not.toHaveBeenCalled();
    });
  });

  describe('requestDeletionChallenge', () => {
    it('issues a deletion challenge for a verified bundled wallet', async () => {
      const { service, accountDeletionChallengeService } = createMocks();

      await service.requestDeletionChallenge('user-1', '0x123');

      expect(
        accountDeletionChallengeService.issueChallenge,
      ).toHaveBeenCalledWith('user-1', '0x123');
    });

    it('rejects an unverified wallet before issuing a challenge', async () => {
      const { service, validationService, accountDeletionChallengeService } =
        createMocks();
      validationService.validateVerifiedWalletOwnership.mockRejectedValue(
        new ConflictException('Wallet ownership has not been verified'),
      );

      await expect(
        service.requestDeletionChallenge('user-1', '0x123'),
      ).rejects.toThrow(ConflictException);
      expect(
        accountDeletionChallengeService.issueChallenge,
      ).not.toHaveBeenCalled();
    });
  });

  describe('verifyWalletOwnership', () => {
    const storedWallet = '0xAbCd000000000000000000000000000000000001';
    const requestedWallet = storedWallet.toLowerCase();
    const signature = '0x' + 'ab'.repeat(65);

    it('verifies a bundled wallet case-insensitively', async () => {
      const { service, qb, walletBindingChallengeService } = createMocks();
      qb.mockResolvedThen({
        data: [{ wallet: storedWallet, ownership_verified_at: null }],
        error: null,
      });
      qb.single.mockResolvedValue({ data: { id: 'w-1' }, error: null });

      const result = await service.verifyWalletOwnership(
        'user-1',
        requestedWallet,
        signature,
      );

      expect(result.success).toBe(true);
      expect(result.ownership_verified_at).toBeTruthy();
      expect(
        walletBindingChallengeService.verifyChallenge,
      ).toHaveBeenCalledWith('user-1', requestedWallet, signature);
      expect(qb.eq).toHaveBeenCalledWith('wallet', storedWallet);
    });

    it('rejects an invalid signature without stamping the wallet', async () => {
      const { service, qb, walletBindingChallengeService } = createMocks();
      qb.mockResolvedThen({
        data: [{ wallet: storedWallet, ownership_verified_at: null }],
        error: null,
      });
      walletBindingChallengeService.verifyChallenge.mockResolvedValue(false);

      await expect(
        service.verifyWalletOwnership('user-1', requestedWallet, signature),
      ).rejects.toThrow(BadRequestException);
      expect(qb.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the wallet is not in the user bundle', async () => {
      const { service, qb, walletBindingChallengeService } = createMocks();
      qb.mockResolvedThen({ data: [], error: null });

      await expect(
        service.verifyWalletOwnership('user-1', requestedWallet, signature),
      ).rejects.toThrow(NotFoundException);
      expect(
        walletBindingChallengeService.verifyChallenge,
      ).not.toHaveBeenCalled();
    });

    it('is idempotent and does not consume a challenge when already verified', async () => {
      const { service, qb, walletBindingChallengeService } = createMocks();
      const verifiedAt = '2026-08-22T00:00:00.000Z';
      qb.mockResolvedThen({
        data: [{ wallet: storedWallet, ownership_verified_at: verifiedAt }],
        error: null,
      });

      await expect(
        service.verifyWalletOwnership('user-1', requestedWallet, signature),
      ).resolves.toMatchObject({
        success: true,
        ownership_verified_at: verifiedAt,
      });
      expect(
        walletBindingChallengeService.verifyChallenge,
      ).not.toHaveBeenCalled();
      expect(qb.update).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateEmail
  // -----------------------------------------------------------------------
  describe('updateEmail', () => {
    it('updates email successfully', async () => {
      const { service, dbMock, srQb } = createMocks();
      srQb.single.mockResolvedValue({
        data: { id: 'user-1' },
        error: null,
      });

      const result = await service.updateEmail('user-1', 'new@test.com');

      expect(result.success).toBe(true);
      expect(result.email_updated).toBe(true);
      expect(result.plan_upgraded).toBe(false);
      expect(dbMock.mock.rpc).not.toHaveBeenCalled();
      expect(srQb.update).toHaveBeenCalledWith({
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
      const { service, srQb } = createMocks();
      srQb.single
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
      expect(srQb.update).toHaveBeenCalledWith({
        is_subscribed_to_reports: false,
      });
    });

    it('rejects a token when the current email no longer matches', async () => {
      const { service, srQb } = createMocks();
      srQb.single.mockResolvedValue({
        data: { email: 'changed@test.com' },
        error: null,
      });

      await expect(
        service.unsubscribeFromReportsWithToken('signed-token'),
      ).rejects.toThrow(BadRequestException);
      expect(srQb.update).not.toHaveBeenCalled();
    });

    it('rejects a token when the user no longer exists', async () => {
      const { service, srQb } = createMocks();
      srQb.single.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(
        service.unsubscribeFromReportsWithToken('signed-token'),
      ).rejects.toThrow(BadRequestException);
      expect(srQb.update).not.toHaveBeenCalled();
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

      expect(result.user).toEqual({ id: 'user-1', email: 'test@test.com' });
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
    it('deletes user without subscription', async () => {
      const { service, qb } = createMocks();
      qb.single.mockResolvedValue({ data: { id: 'user-1' }, error: null });

      const result = await service.deleteUser(
        'user-1',
        '0x123',
        '0x' + 'ab'.repeat(65),
      );
      expect(result.success).toBe(true);
    });

    it('rejects deletion when the wallet does not belong to the user', async () => {
      const { service, validationService, accountDeletionChallengeService } =
        createMocks();
      validationService.validateVerifiedWalletOwnership.mockRejectedValue(
        new NotFoundException('Wallet not found'),
      );

      await expect(
        service.deleteUser('user-1', '0x456', '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow(NotFoundException);
      expect(
        accountDeletionChallengeService.verifyChallenge,
      ).not.toHaveBeenCalled();
    });

    it('rejects an invalid deletion signature before deleting', async () => {
      const { service, qb, accountDeletionChallengeService } = createMocks();
      accountDeletionChallengeService.verifyChallenge.mockResolvedValue(false);

      await expect(
        service.deleteUser('user-1', '0x123', '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow(BadRequestException);
      expect(qb.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, validationService } = createMocks();
      validationService.validateUserExists.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        service.deleteUser('user-999', '0x123', '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow(NotFoundException);
    });

    it('issues one user delete and relies on database cascades', async () => {
      const { service, qb, srQb } = createMocks();
      qb.single.mockResolvedValue({ data: { id: 'user-1' }, error: null });

      await service.deleteUser('user-1', '0x123', '0x' + 'ab'.repeat(65));

      expect(qb.delete).toHaveBeenCalledTimes(1);
      expect(qb.eq).toHaveBeenCalledWith('id', 'user-1');
      expect(srQb.delete).not.toHaveBeenCalled();
      expect(qb.update).not.toHaveBeenCalled();
    });

    it('rejects an unverified wallet before consuming a deletion challenge', async () => {
      const { service, validationService, accountDeletionChallengeService } =
        createMocks();
      validationService.validateVerifiedWalletOwnership.mockRejectedValue(
        new ConflictException('Wallet ownership has not been verified'),
      );

      await expect(
        service.deleteUser('user-1', '0x123', '0x' + 'ab'.repeat(65)),
      ).rejects.toThrow(ConflictException);
      expect(
        accountDeletionChallengeService.verifyChallenge,
      ).not.toHaveBeenCalled();
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
