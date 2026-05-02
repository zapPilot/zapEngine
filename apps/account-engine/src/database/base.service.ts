import { SupabaseClient } from '@supabase/supabase-js';

import { ServiceLayerException } from '../common/exceptions';
import { HttpException, HttpStatus } from '../common/http';
import { Logger } from '../common/logger';
import { Database } from '../types/database.types';
import { DatabaseService } from './database.service';
import {
  DatabaseOperationResult,
  SupabaseErrorHandler,
} from './supabase-error.handler';

type PrimitiveCondition = string | number | boolean | null;
type ConditionValue =
  | PrimitiveCondition
  | readonly PrimitiveCondition[]
  | undefined;
type UpdateResult<T> = T | T[] | null;
interface FilterableQuery<T> {
  in(column: string, values: readonly unknown[]): T;
  eq(column: string, value: unknown): T;
}

const isArrayCondition = (
  value: ConditionValue,
): value is readonly PrimitiveCondition[] => Array.isArray(value);

/**
 * Abstract base service providing common database operation patterns
 * Eliminates repetitive Supabase client access and error handling
 */
export abstract class BaseService {
  protected readonly logger: Logger;

  /* istanbul ignore next -- DI constructor */
  constructor(protected readonly databaseService: DatabaseService) {
    this.logger = new Logger(this.constructor.name);
  }

  protected get supabase(): SupabaseClient<Database> {
    return this.databaseService.getClient();
  }

  protected get serviceRoleSupabase(): SupabaseClient<Database> {
    return this.databaseService.getServiceRoleClient();
  }

  private resolveClient(useServiceRole?: boolean): SupabaseClient<Database> {
    return useServiceRole ? this.serviceRoleSupabase : this.supabase;
  }

  private buildSelectQuery(
    table: string,
    conditions: Record<string, ConditionValue>,
    select: string,
    useServiceRole?: boolean,
  ) {
    const client = this.resolveClient(useServiceRole);
    const query = client.from(table as never).select(select);
    return this.applyConditions(query, conditions);
  }

  /**
   * Execute a single record query with standardized error handling
   */
  protected async findOne<T>(
    table: string,
    conditions: Record<string, ConditionValue>,
    options: {
      select?: string;
      entityName?: string;
      throwOnNotFound?: boolean;
      useServiceRole?: boolean;
    } = {},
  ): Promise<T | null> {
    const {
      select = '*',
      entityName = 'Resource',
      throwOnNotFound = true,
      useServiceRole = false,
    } = options;

    const query = this.buildSelectQuery(
      table,
      conditions,
      select,
      useServiceRole,
    );
    const result = await query.single();

    return SupabaseErrorHandler.validateOperation<T>(
      result as DatabaseOperationResult<T>,
      `fetch ${entityName.toLowerCase()}`,
      entityName,
      { throwOnNotFound },
    );
  }

  /**
   * Execute a multiple records query with standardized error handling
   */
  protected async findMany<T>(
    table: string,
    conditions: Record<string, ConditionValue> = {},
    options: {
      select?: string;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
      entityName?: string;
    } = {},
  ): Promise<T[]> {
    const { select = '*', orderBy, limit, entityName = 'Resources' } = options;

    let query = this.buildSelectQuery(table, conditions, select);

    // Apply ordering
    if (orderBy) {
      query = query.order(orderBy.column, {
        ascending: orderBy.ascending ?? true,
      });
    }

    // Apply limit
    if (limit) {
      query = query.limit(limit);
    }

    const result = await query;

    const data = SupabaseErrorHandler.validateOperation<T[]>(
      result as DatabaseOperationResult<T[]>,
      `fetch ${entityName.toLowerCase()}`,
      entityName,
      { throwOnNotFound: false },
    );

    return data ?? [];
  }

  /**
   * Insert a single record with standardized error handling
   */
  protected async insertOne<T>(
    table: string,
    data: Record<string, unknown>,
    options: {
      select?: string;
      entityName?: string;
    } = {},
  ): Promise<T> {
    const { select = '*', entityName = 'Resource' } = options;

    const builder = this.supabase.from(table as never).insert(data as never);
    const query = select ? builder.select(select) : builder;

    const result = await query.single();

    return SupabaseErrorHandler.validateOperation<T>(
      result as DatabaseOperationResult<T>,
      `create ${entityName.toLowerCase()}`,
      entityName,
    ) as T;
  }

  /**
   * Update records with standardized error handling
   */
  protected async updateWhere<T>(
    table: string,
    updates: Record<string, unknown>,
    conditions: Record<string, ConditionValue>,
    options: {
      select?: string;
      entityName?: string;
      requireSingleResult?: boolean;
      useServiceRole?: boolean;
    } = {},
  ): Promise<UpdateResult<T>> {
    const {
      select = '*',
      entityName = 'Resource',
      requireSingleResult = false,
      useServiceRole = false,
    } = options;

    const client = this.resolveClient(useServiceRole);
    let query = client.from(table as never).update(updates as never);
    query = this.applyConditions(query, conditions);

    const finalQuery = select ? query.select(select) : query;

    const result = requireSingleResult
      ? await finalQuery.single()
      : await finalQuery;

    return SupabaseErrorHandler.validateOperation<UpdateResult<T>>(
      result as DatabaseOperationResult<UpdateResult<T>>,
      `update ${entityName.toLowerCase()}`,
      entityName,
    );
  }

  /**
   * Delete records with standardized error handling
   */
  protected async deleteWhere(
    table: string,
    conditions: Record<string, ConditionValue>,
    options: {
      entityName?: string;
      requireSingleResult?: boolean;
      useServiceRole?: boolean;
    } = {},
  ): Promise<void> {
    const {
      entityName = 'Resource',
      requireSingleResult = false,
      useServiceRole = false,
    } = options;

    const query = this.applyConditions(
      this.resolveClient(useServiceRole)
        .from(table as never)
        .delete(),
      conditions,
    );

    const result = requireSingleResult ? await query.single() : await query;

    SupabaseErrorHandler.validateOperation<null>(
      result as DatabaseOperationResult<null>,
      `delete ${entityName.toLowerCase()}`,
      entityName,
    );
  }

  /**
   * Check if a record exists without throwing on not found
   */
  protected async exists(
    table: string,
    conditions: Record<string, ConditionValue>,
    entityName = 'Resource',
  ): Promise<boolean> {
    const result = await this.findOne(table, conditions, {
      select: 'id',
      entityName,
      throwOnNotFound: false,
    });
    return result !== null;
  }

  /**
   * Verify a record exists, throwing NotFoundException if not
   */
  protected async mustExist<T>(
    table: string,
    conditions: Record<string, ConditionValue>,
    entityName = 'Resource',
    select = 'id',
  ): Promise<T> {
    return this.findOne<T>(table, conditions, {
      select,
      entityName,
      throwOnNotFound: true,
    }) as Promise<T>;
  }

  /**
   * Centralized error handler for service operations.
   * Preserves HttpExceptions (NotFoundException, ConflictException, etc.) and wraps unexpected errors.
   *
   * @param error The caught error
   * @param operationContext A brief description of what operation failed (e.g., "create user", "update wallet")
   * @param statusCode The HTTP status code for unexpected errors (default: 400)
   * @returns Never returns - always throws
   */
  protected handleServiceError(
    error: unknown,
    operationContext: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ): never {
    // If it's already an HttpException, let it propagate as-is
    if (error instanceof HttpException) {
      throw error;
    }

    // For unexpected errors, wrap them with context for the exception filter
    throw new ServiceLayerException(
      `Failed to ${operationContext}`,
      statusCode,
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  /**
   * Wraps an async operation with standardized error handling.
   * Catches errors and delegates to handleServiceError for consistent error propagation.
   */
  protected async withErrorHandling<T>(
    operation: () => Promise<T>,
    errorContext: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.handleServiceError(error, errorContext);
    }
  }

  /**
   * Applies conditions to a Supabase query builder
   */
  private applyConditions<T extends FilterableQuery<T>>(
    query: T,
    conditions: Record<string, ConditionValue>,
  ): T {
    let modifiedQuery = query;

    Object.entries(conditions).forEach(([key, value]) => {
      if (isArrayCondition(value)) {
        modifiedQuery = modifiedQuery.in(key, value);
      } else if (value !== undefined) {
        modifiedQuery = modifiedQuery.eq(key, value);
      }
    });

    return modifiedQuery;
  }
}
