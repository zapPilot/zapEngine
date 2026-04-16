import { ServiceLayerException } from '@common/exceptions';
import { NotFoundException } from '@common/http';
import { DatabaseService } from '@database/database.service';
import { UserValidationService } from '@database/user-validation.service';
import { createMockDatabaseService } from '@test-utils';

describe('UserValidationService', () => {
  let service: UserValidationService;
  let dbMock: ReturnType<typeof createMockDatabaseService>;

  beforeEach(() => {
    dbMock = createMockDatabaseService();
    service = new UserValidationService(
      dbMock.mock as unknown as DatabaseService,
    );
  });

  const qb = () => dbMock.anon.queryBuilder;

  describe('validateUserExists', () => {
    it('returns user data when user exists', async () => {
      const user = { id: 'user-1', email: 'test@test.com' };
      qb().single.mockResolvedValue({ data: user, error: null });

      const result = await service.validateUserExists('user-1');
      expect(result).toEqual(user);
    });

    it('throws NotFoundException when user does not exist', async () => {
      qb().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await expect(service.validateUserExists('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('validateWalletOwnership', () => {
    it('returns wallet when wallet belongs to user', async () => {
      const wallet = {
        id: 'w-1',
        wallet: '0x123',
        user_id: 'user-1',
      };
      qb().single.mockResolvedValue({ data: wallet, error: null });

      const result = await service.validateWalletOwnership('0x123', 'user-1');
      expect(result).toEqual(wallet);
    });

    it('throws NotFoundException when wallet not found', async () => {
      qb().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await expect(
        service.validateWalletOwnership('0x123', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateWalletAvailability', () => {
    it('returns isAvailable true when wallet does not exist', async () => {
      qb().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const result = await service.validateWalletAvailability(
        '0x123',
        'user-1',
      );
      expect(result).toEqual({ isAvailable: true });
    });

    it('returns belongsToCurrentUser true when wallet belongs to requesting user', async () => {
      qb().single.mockResolvedValue({
        data: { id: 'w-1', user_id: 'user-1', wallet: '0x123' },
        error: null,
      });

      const result = await service.validateWalletAvailability(
        '0x123',
        'user-1',
      );
      expect(result).toEqual({
        isAvailable: false,
        belongsToCurrentUser: true,
        existingUserId: 'user-1',
      });
    });

    it('returns belongsToCurrentUser false when wallet belongs to another user', async () => {
      qb().single.mockResolvedValue({
        data: { id: 'w-1', user_id: 'user-2', wallet: '0x123' },
        error: null,
      });

      const result = await service.validateWalletAvailability(
        '0x123',
        'user-1',
      );
      expect(result).toEqual({
        isAvailable: false,
        belongsToCurrentUser: false,
        existingUserId: 'user-2',
      });
    });
  });

  describe('validateEmailAvailability', () => {
    it('returns isAvailable true when email not in use', async () => {
      qb().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const result = await service.validateEmailAvailability(
        'new@test.com',
        'user-1',
      );
      expect(result).toEqual({ isAvailable: true });
    });

    it('returns isAvailable false when email belongs to another user', async () => {
      qb().single.mockResolvedValue({
        data: { id: 'user-2' },
        error: null,
      });

      const result = await service.validateEmailAvailability(
        'taken@test.com',
        'user-1',
      );
      expect(result.isAvailable).toBe(false);
    });

    it('throws ServiceLayerException on non-PGRST116 database error', async () => {
      qb().single.mockResolvedValue({
        data: null,
        error: { code: '42000', message: 'syntax error' },
      });

      await expect(
        service.validateEmailAvailability('test@test.com', 'user-1'),
      ).rejects.toThrow(ServiceLayerException);
    });
  });

  describe('getActiveSubscriptionWithPlan', () => {
    it('returns subscription with plan when active subscription exists', async () => {
      const subscription = {
        id: 'sub-1',
        user_id: 'user-1',
        is_canceled: false,
        plans: { code: 'vip', name: 'VIP', tier: 1 },
      };
      qb().single.mockResolvedValue({ data: subscription, error: null });

      const result = await service.getActiveSubscriptionWithPlan('user-1');
      expect(result).toEqual(subscription);
    });

    it('returns null when no active subscription', async () => {
      qb().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const result = await service.getActiveSubscriptionWithPlan('user-1');
      expect(result).toBeNull();
    });
  });
});
