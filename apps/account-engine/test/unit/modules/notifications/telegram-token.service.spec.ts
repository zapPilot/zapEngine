import { ServiceLayerException } from '@common/exceptions';
import { BadRequestException } from '@common/http';
import { DatabaseService } from '@database/database.service';
import { TelegramTokenService } from '@modules/notifications/telegram-token.service';
import { configureMockResults, createMockDatabaseService } from '@test-utils';

describe('TelegramTokenService', () => {
  let service: TelegramTokenService;
  let dbMock: ReturnType<typeof createMockDatabaseService>;

  beforeEach(() => {
    dbMock = createMockDatabaseService();
    service = new TelegramTokenService(
      dbMock.mock as unknown as DatabaseService,
    );
  });

  const srQb = () => dbMock.serviceRole.queryBuilder;

  describe('generateToken', () => {
    it('generates a token when rate limit not exceeded', async () => {
      // Two sequential awaits on same query builder: rate-limit check, then insert
      configureMockResults(srQb(), [
        { data: [], error: null }, // rate limit check
        { data: null, error: null }, // insert
      ]);

      const result = await service.generateToken('user-1');

      expect(result.token).toHaveLength(32); // 16 bytes hex
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws BadRequestException when rate limited', async () => {
      configureMockResults(srQb(), [
        { data: [{ created_at: new Date().toISOString() }], error: null },
      ]);

      await expect(service.generateToken('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ServiceLayerException on rate limit check error', async () => {
      configureMockResults(srQb(), [
        { data: null, error: { message: 'DB error' } },
      ]);

      await expect(service.generateToken('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws ServiceLayerException on insert error', async () => {
      configureMockResults(srQb(), [
        { data: [], error: null }, // rate limit check OK
        { data: null, error: { message: 'insert failed' } }, // insert fails
      ]);

      await expect(service.generateToken('user-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });
  });

  describe('validateToken', () => {
    it('returns userId for valid token', async () => {
      const futureDate = new Date(Date.now() + 600_000).toISOString();
      srQb().single.mockResolvedValue({
        data: { user_id: 'user-1', expires_at: futureDate, used_at: null },
        error: null,
      });

      const result = await service.validateToken('abc123');
      expect(result).toBe('user-1');
    });

    it('returns null for empty token', async () => {
      expect(await service.validateToken('')).toBeNull();
    });

    it('returns null when token not found', async () => {
      srQb().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      expect(await service.validateToken('bad')).toBeNull();
    });

    it('returns null for already used token', async () => {
      srQb().single.mockResolvedValue({
        data: {
          user_id: 'user-1',
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          used_at: new Date().toISOString(),
        },
        error: null,
      });

      expect(await service.validateToken('used')).toBeNull();
    });

    it('returns null for expired token', async () => {
      srQb().single.mockResolvedValue({
        data: {
          user_id: 'user-1',
          expires_at: new Date(Date.now() - 1000).toISOString(),
          used_at: null,
        },
        error: null,
      });

      expect(await service.validateToken('expired')).toBeNull();
    });
  });

  describe('invalidateToken', () => {
    it('marks token as used', async () => {
      srQb().mockResolvedThen({ data: null, error: null });

      await expect(service.invalidateToken('tok')).resolves.toBeUndefined();
    });

    it('throws ServiceLayerException on error', async () => {
      srQb().mockResolvedThen({
        data: null,
        error: { message: 'update failed' },
      });

      await expect(service.invalidateToken('tok')).rejects.toThrow(
        ServiceLayerException,
      );
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('returns deleted count from rpc', async () => {
      dbMock.serviceRole.client.rpc.mockResolvedValue({ data: 5, error: null });

      const count = await service.cleanupExpiredTokens();
      expect(count).toBe(5);
    });

    it('throws ServiceLayerException on rpc error', async () => {
      dbMock.serviceRole.client.rpc.mockResolvedValue({
        data: null,
        error: { message: 'rpc failed' },
      });

      await expect(service.cleanupExpiredTokens()).rejects.toThrow(
        ServiceLayerException,
      );
    });
  });
});
