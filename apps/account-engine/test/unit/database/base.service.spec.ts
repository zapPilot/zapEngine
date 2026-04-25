import { ServiceLayerException } from '@/common/exceptions';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@/common/http';
import { BaseService } from '@/database/base.service';
import { DatabaseService } from '@/database/database.service';
import { createMockDatabaseService } from '@/test-utils';

/** Concrete subclass that exposes protected BaseService methods for testing */
class TestableService extends BaseService {
  constructor(databaseService: DatabaseService) {
    super(databaseService);
  }

  exposeFindOne<T>(...args: Parameters<BaseService['findOne']>) {
    return this.findOne<T>(...args);
  }
  exposeFindMany<T>(...args: Parameters<BaseService['findMany']>) {
    return this.findMany<T>(...args);
  }
  exposeInsertOne<T>(...args: Parameters<BaseService['insertOne']>) {
    return this.insertOne<T>(...args);
  }
  exposeUpdateWhere<T>(...args: Parameters<BaseService['updateWhere']>) {
    return this.updateWhere<T>(...args);
  }
  exposeDeleteWhere(...args: Parameters<BaseService['deleteWhere']>) {
    return this.deleteWhere(...args);
  }
  exposeExists(...args: Parameters<BaseService['exists']>) {
    return this.exists(...args);
  }
  exposeMustExist<T>(...args: Parameters<BaseService['mustExist']>) {
    return this.mustExist<T>(...args);
  }
  exposeHandleServiceError(
    ...args: Parameters<BaseService['handleServiceError']>
  ) {
    return this.handleServiceError(...args);
  }
  exposeWithErrorHandling<T>(
    operation: () => Promise<T>,
    errorContext: string,
  ) {
    return this.withErrorHandling<T>(operation, errorContext);
  }
}

describe('BaseService', () => {
  let service: TestableService;
  let dbMock: ReturnType<typeof createMockDatabaseService>;
  let qb: ReturnType<typeof createMockDatabaseService>['anon']['queryBuilder'];

  beforeEach(() => {
    dbMock = createMockDatabaseService();
    service = new TestableService(dbMock.mock as unknown as DatabaseService);
    qb = dbMock.anon.queryBuilder;
  });

  // -----------------------------------------------------------------------
  // findOne
  // -----------------------------------------------------------------------
  describe('findOne', () => {
    it('returns data when record exists', async () => {
      qb.single.mockResolvedValue({
        data: { id: '1', name: 'Alice' },
        error: null,
      });

      const result = await service.exposeFindOne('users', { id: '1' });
      expect(result).toEqual({ id: '1', name: 'Alice' });
      expect(dbMock.anon.client.from).toHaveBeenCalledWith('users');
      expect(qb.select).toHaveBeenCalledWith('*');
      expect(qb.eq).toHaveBeenCalledWith('id', '1');
    });

    it('throws NotFoundException when throwOnNotFound is true (default)', async () => {
      qb.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await expect(service.exposeFindOne('users', { id: '1' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns null when throwOnNotFound is false', async () => {
      qb.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const result = await service.exposeFindOne(
        'users',
        { id: '1' },
        {
          throwOnNotFound: false,
        },
      );
      expect(result).toBeNull();
    });

    it('uses custom select and entity name', async () => {
      qb.single.mockResolvedValue({ data: { id: '1' }, error: null });

      await service.exposeFindOne(
        'users',
        { id: '1' },
        {
          select: 'id, email',
          entityName: 'User',
        },
      );
      expect(qb.select).toHaveBeenCalledWith('id, email');
    });

    it('uses service role client when useServiceRole is true', async () => {
      dbMock.serviceRole.queryBuilder.single.mockResolvedValue({
        data: { id: '1' },
        error: null,
      });

      await service.exposeFindOne(
        'users',
        { id: '1' },
        {
          useServiceRole: true,
        },
      );
      expect(dbMock.serviceRole.client.from).toHaveBeenCalledWith('users');
    });

    it('applies array conditions with .in()', async () => {
      qb.single.mockResolvedValue({ data: { id: '1' }, error: null });

      await service.exposeFindOne('users', { id: ['1', '2'] } as any);
      expect(qb.in).toHaveBeenCalledWith('id', ['1', '2']);
    });

    it('skips undefined condition values', async () => {
      qb.single.mockResolvedValue({ data: { id: '1' }, error: null });

      await service.exposeFindOne('users', { id: '1', name: undefined });
      expect(qb.eq).toHaveBeenCalledTimes(1);
      expect(qb.eq).toHaveBeenCalledWith('id', '1');
    });
  });

  // -----------------------------------------------------------------------
  // findMany
  // -----------------------------------------------------------------------
  describe('findMany', () => {
    it('returns array of records', async () => {
      const data = [{ id: '1' }, { id: '2' }];
      qb.mockResolvedThen({ data, error: null });

      const result = await service.exposeFindMany('users');
      expect(result).toEqual(data);
    });

    it('returns empty array when no results', async () => {
      qb.mockResolvedThen({ data: null, error: null });

      const result = await service.exposeFindMany('users');
      expect(result).toEqual([]);
    });

    it('applies ordering', async () => {
      qb.mockResolvedThen({ data: [], error: null });

      await service.exposeFindMany(
        'users',
        {},
        {
          orderBy: { column: 'created_at', ascending: false },
        },
      );
      expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('applies limit', async () => {
      qb.mockResolvedThen({ data: [], error: null });

      await service.exposeFindMany('users', {}, { limit: 10 });
      expect(qb.limit).toHaveBeenCalledWith(10);
    });

    it('applies conditions', async () => {
      qb.mockResolvedThen({ data: [], error: null });

      await service.exposeFindMany('users', { status: 'active' });
      expect(qb.eq).toHaveBeenCalledWith('status', 'active');
    });
  });

  // -----------------------------------------------------------------------
  // insertOne
  // -----------------------------------------------------------------------
  describe('insertOne', () => {
    it('inserts and returns the record', async () => {
      qb.single.mockResolvedValue({
        data: { id: '1', name: 'Alice' },
        error: null,
      });

      const result = await service.exposeInsertOne('users', { name: 'Alice' });
      expect(result).toEqual({ id: '1', name: 'Alice' });
      expect(qb.insert).toHaveBeenCalledWith({ name: 'Alice' });
    });

    it('throws ConflictException on duplicate key', async () => {
      qb.single.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate' },
      });

      await expect(
        service.exposeInsertOne('users', { name: 'Alice' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -----------------------------------------------------------------------
  // updateWhere
  // -----------------------------------------------------------------------
  describe('updateWhere', () => {
    it('updates and returns records', async () => {
      qb.mockResolvedThen({ data: [{ id: '1', name: 'Bob' }], error: null });

      const result = await service.exposeUpdateWhere(
        'users',
        { name: 'Bob' },
        { id: '1' },
      );
      expect(result).toEqual([{ id: '1', name: 'Bob' }]);
      expect(qb.update).toHaveBeenCalledWith({ name: 'Bob' });
      expect(qb.eq).toHaveBeenCalledWith('id', '1');
    });

    it('returns single result when requireSingleResult is true', async () => {
      qb.single.mockResolvedValue({
        data: { id: '1', name: 'Bob' },
        error: null,
      });

      const result = await service.exposeUpdateWhere(
        'users',
        { name: 'Bob' },
        { id: '1' },
        { requireSingleResult: true },
      );
      expect(result).toEqual({ id: '1', name: 'Bob' });
    });

    it('uses service role client when specified', async () => {
      dbMock.serviceRole.queryBuilder.mockResolvedThen({
        data: [{ id: '1' }],
        error: null,
      });

      await service.exposeUpdateWhere(
        'users',
        { name: 'Bob' },
        { id: '1' },
        { useServiceRole: true },
      );
      expect(dbMock.serviceRole.client.from).toHaveBeenCalledWith('users');
    });
  });

  // -----------------------------------------------------------------------
  // deleteWhere
  // -----------------------------------------------------------------------
  describe('deleteWhere', () => {
    it('deletes matching records', async () => {
      qb.mockResolvedThen({ data: null, error: null });

      await service.exposeDeleteWhere('users', { id: '1' });
      expect(qb.delete).toHaveBeenCalled();
      expect(qb.eq).toHaveBeenCalledWith('id', '1');
    });

    it('throws on database error', async () => {
      qb.mockResolvedThen({
        data: null,
        error: { code: '23503', message: 'fk violation' },
      });

      await expect(
        service.exposeDeleteWhere('users', { id: '1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // exists
  // -----------------------------------------------------------------------
  describe('exists', () => {
    it('returns true when record exists', async () => {
      qb.single.mockResolvedValue({ data: { id: '1' }, error: null });

      const result = await service.exposeExists('users', { id: '1' });
      expect(result).toBe(true);
    });

    it('returns false when record does not exist', async () => {
      qb.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const result = await service.exposeExists('users', { id: '1' });
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // mustExist
  // -----------------------------------------------------------------------
  describe('mustExist', () => {
    it('returns data when record exists', async () => {
      qb.single.mockResolvedValue({ data: { id: '1' }, error: null });

      const result = await service.exposeMustExist('users', { id: '1' });
      expect(result).toEqual({ id: '1' });
    });

    it('throws NotFoundException when record does not exist', async () => {
      qb.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await expect(
        service.exposeMustExist('users', { id: '1' }, 'User'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // handleServiceError
  // -----------------------------------------------------------------------
  describe('handleServiceError', () => {
    it('re-throws HttpException as-is', () => {
      const original = new NotFoundException('User not found');
      expect(() =>
        service.exposeHandleServiceError(original, 'fetch user'),
      ).toThrow(original);
    });

    it('wraps non-HttpException Error in ServiceLayerException', () => {
      const original = new Error('DB timeout');
      expect(() =>
        service.exposeHandleServiceError(original, 'fetch user'),
      ).toThrow(ServiceLayerException);
    });

    it('wraps non-Error values in ServiceLayerException', () => {
      expect(() =>
        service.exposeHandleServiceError('string error', 'fetch user'),
      ).toThrow(ServiceLayerException);
    });

    it('uses provided status code', () => {
      try {
        service.exposeHandleServiceError(
          new Error('fail'),
          'fetch user',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } catch (error) {
        expect((error as ServiceLayerException).statusCode).toBe(500);
      }
    });
  });

  // -----------------------------------------------------------------------
  // withErrorHandling
  // -----------------------------------------------------------------------
  describe('withErrorHandling', () => {
    it('returns the result of successful operation', async () => {
      const result = await service.exposeWithErrorHandling(
        () => Promise.resolve({ id: '1' }),
        'fetch user',
      );
      expect(result).toEqual({ id: '1' });
    });

    it('wraps thrown errors via handleServiceError', async () => {
      await expect(
        service.exposeWithErrorHandling(() => {
          throw new Error('DB timeout');
        }, 'fetch user'),
      ).rejects.toThrow(ServiceLayerException);
    });

    it('preserves HttpException through withErrorHandling', async () => {
      await expect(
        service.exposeWithErrorHandling(() => {
          throw new NotFoundException('User not found');
        }, 'fetch user'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
