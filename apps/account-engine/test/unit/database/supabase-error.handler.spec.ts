import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../../src/common/http';
import {
  SupabaseErrorCode,
  SupabaseErrorHandler,
} from '../../../src/database/supabase-error.handler';

describe('SupabaseErrorHandler', () => {
  describe('handleDatabaseError', () => {
    it('throws NotFoundException for PGRST116 (no rows found)', () => {
      const error = { code: SupabaseErrorCode.NO_ROWS_FOUND, message: '' };
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(error, 'fetch user', 'User'),
      ).toThrow(NotFoundException);
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(error, 'fetch user', 'User'),
      ).toThrow('User not found');
    });

    it('throws ConflictException for 23505 (duplicate key)', () => {
      const error = { code: SupabaseErrorCode.DUPLICATE_KEY, message: '' };
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(
          error,
          'create wallet',
          'Wallet',
        ),
      ).toThrow(ConflictException);
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(
          error,
          'create wallet',
          'Wallet',
        ),
      ).toThrow('Wallet already exists');
    });

    it('throws BadRequestException for 23503 (foreign key violation)', () => {
      const error = {
        code: SupabaseErrorCode.FOREIGN_KEY_VIOLATION,
        message: '',
      };
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(error, 'create record'),
      ).toThrow(BadRequestException);
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(error, 'create record'),
      ).toThrow('Invalid reference to related data');
    });

    it('throws BadRequestException for 23514 (check violation)', () => {
      const error = { code: SupabaseErrorCode.CHECK_VIOLATION, message: '' };
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(error, 'update record'),
      ).toThrow(BadRequestException);
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(error, 'update record'),
      ).toThrow('Data validation constraint violated');
    });

    it('throws BadRequestException with operation context for unknown errors', () => {
      const error = { code: 'UNKNOWN', message: 'Something went wrong' };
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(error, 'Delete Record'),
      ).toThrow(BadRequestException);
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(error, 'Delete Record'),
      ).toThrow('Failed to delete record');
    });

    it('defaults entity name to Resource when not provided', () => {
      const error = { code: SupabaseErrorCode.NO_ROWS_FOUND, message: '' };
      expect(() =>
        SupabaseErrorHandler.handleDatabaseError(error, 'fetch'),
      ).toThrow('Resource not found');
    });
  });

  describe('validateOperation', () => {
    it('returns data when no error', () => {
      const result = { data: { id: '1' }, error: null };
      expect(
        SupabaseErrorHandler.validateOperation(result, 'fetch user'),
      ).toEqual({ id: '1' });
    });

    it('returns null for PGRST116 when throwOnNotFound is false', () => {
      const result = {
        data: null,
        error: { code: SupabaseErrorCode.NO_ROWS_FOUND, message: '' },
      };
      expect(
        SupabaseErrorHandler.validateOperation(result, 'fetch user', 'User', {
          throwOnNotFound: false,
        }),
      ).toBeNull();
    });

    it('throws NotFoundException for PGRST116 when throwOnNotFound is true', () => {
      const result = {
        data: null,
        error: { code: SupabaseErrorCode.NO_ROWS_FOUND, message: '' },
      };
      expect(() =>
        SupabaseErrorHandler.validateOperation(result, 'fetch user', 'User', {
          throwOnNotFound: true,
        }),
      ).toThrow(NotFoundException);
    });

    it('throws for non-PGRST116 errors even when throwOnNotFound is false', () => {
      const result = {
        data: null,
        error: { code: SupabaseErrorCode.DUPLICATE_KEY, message: '' },
      };
      expect(() =>
        SupabaseErrorHandler.validateOperation(result, 'create user', 'User', {
          throwOnNotFound: false,
        }),
      ).toThrow(ConflictException);
    });

    it('returns null data as null when no error', () => {
      const result = { data: null, error: null };
      expect(
        SupabaseErrorHandler.validateOperation(result, 'fetch user'),
      ).toBeNull();
    });
  });
});
