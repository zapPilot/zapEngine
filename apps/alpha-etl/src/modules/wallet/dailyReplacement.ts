import type { PoolClient } from 'pg';

import type { WriteResult } from '../../core/database/baseWriter.js';
import { logger } from '../../utils/logger.js';

interface InsertValues {
  columns: readonly string[];
  placeholders: string;
  values: unknown[];
}

interface ReplaceRowsOptions<T> {
  client: PoolClient;
  table: string;
  deleteSql: string;
  deleteValues: unknown[];
  rows: T[];
  batchSize: number;
  buildInsertValues: (rows: T[]) => InsertValues;
}

export async function replaceRowsInTransaction<T>(
  options: ReplaceRowsOptions<T>,
): Promise<number> {
  const {
    client,
    table,
    deleteSql,
    deleteValues,
    rows,
    batchSize,
    buildInsertValues,
  } = options;

  await client.query('BEGIN');
  await client.query(deleteSql, deleteValues);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { columns, placeholders, values } = buildInsertValues(batch);
    const batchResult = await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`,
      values,
    );
    inserted += batchResult.rowCount ?? 0;
  }

  await client.query('COMMIT');
  return inserted;
}

export async function recordReplacementResult(
  result: WriteResult,
  walletDays: number,
  message: string,
  replace: () => Promise<number>,
): Promise<WriteResult> {
  try {
    result.recordsInserted = await replace();
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }

  logger.info(message, {
    records: result.recordsInserted,
    walletDays,
  });

  return result;
}
