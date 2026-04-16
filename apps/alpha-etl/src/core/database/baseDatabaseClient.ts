import { getDbClient } from '../../config/database.js';
import { DatabaseError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { PoolClient } from 'pg';

/**
 * Base database client providing connection management for ETL operations
 * Contains only the essential database client helper used by writers and fetchers
 */
export abstract class BaseDatabaseClient {
  private async rollbackIfNeeded(client: PoolClient | null): Promise<void> {
    if (!client) {
      return;
    }

    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Ignore rollback errors (transaction may not be active)
      logger.debug('Transaction rollback attempted after error', { rollbackError });
    }
  }

  private releaseClient(client: PoolClient | null): void {
    if (client) {
      client.release();
    }
  }

  /**
   * Execute database operation with proper connection management
   * Handles connection acquisition, error handling, and cleanup
   */
  protected async withDatabaseClient<T>(
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    let client: PoolClient | null = null;
    try {
      client = await getDbClient();
      return await operation(client);
    } catch (error) {
      // Ensure clean state by rolling back any failed transaction
      // This prevents "current transaction is aborted" errors in subsequent operations
      await this.rollbackIfNeeded(client);

      logger.error('Database operation failed:', error);
      throw new DatabaseError(
        error instanceof Error ? error.message : 'Unknown database error',
        'database_operation'
      );
    } finally {
      this.releaseClient(client);
    }
  }
}
