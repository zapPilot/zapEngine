import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../common/http';
import { Logger } from '../common/logger';

/**
 * Standard error codes from Supabase/PostgREST
 */
export enum SupabaseErrorCode {
  NO_ROWS_FOUND = 'PGRST116',
  DUPLICATE_KEY = '23505',
  FOREIGN_KEY_VIOLATION = '23503',
  CHECK_VIOLATION = '23514',
}

/**
 * PostgreSQL/Supabase error structure
 */
export interface PostgresError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/**
 * Standard database operation result types
 */
export interface DatabaseOperationResult<T> {
  data: T | null;
  error: PostgresError | Error | null;
}

/**
 * Configuration for database operations
 */
export interface DatabaseOperationConfig {
  throwOnNotFound?: boolean;
}

/**
 * Utility class for standardized Supabase error handling
 */
export class SupabaseErrorHandler {
  private static logger = new Logger(SupabaseErrorHandler.name);

  private static getErrorCode(
    error: PostgresError | Error,
  ): string | undefined {
    return typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  }

  /**
   * Handles common Supabase/PostgreSQL errors with standardized responses
   */
  static handleDatabaseError(
    error: PostgresError | Error,
    operation: string,
    entityName?: string,
  ): never {
    this.logger.error(`Database error in ${operation}:`, error);

    const errorCode = this.getErrorCode(error);

    switch (errorCode) {
      case SupabaseErrorCode.NO_ROWS_FOUND:
        throw new NotFoundException(`${entityName ?? 'Resource'} not found`);

      case SupabaseErrorCode.DUPLICATE_KEY:
        throw new ConflictException(
          `${entityName ?? 'Resource'} already exists`,
        );

      case SupabaseErrorCode.FOREIGN_KEY_VIOLATION:
        throw new BadRequestException('Invalid reference to related data');

      case SupabaseErrorCode.CHECK_VIOLATION:
        throw new BadRequestException('Data validation constraint violated');

      default:
        throw new BadRequestException(`Failed to ${operation.toLowerCase()}`);
    }
  }

  /**
   * Checks if operation succeeded, throwing appropriate errors if not
   */
  static validateOperation<T>(
    result: DatabaseOperationResult<T>,
    operation: string,
    entityName?: string,
    config: DatabaseOperationConfig = {},
  ): T | null {
    const { throwOnNotFound = true } = config;

    if (result.error) {
      const error = result.error;

      if (
        !throwOnNotFound &&
        this.getErrorCode(error) === SupabaseErrorCode.NO_ROWS_FOUND
      ) {
        return null;
      }

      this.logger.error(`${operation} failed:`, error);
      this.handleDatabaseError(error, operation, entityName);
    }

    return result.data;
  }
}
