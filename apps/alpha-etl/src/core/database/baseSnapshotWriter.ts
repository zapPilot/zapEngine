import { getTableName, type TableName } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { BaseWriter } from './baseWriter.js';

export interface SnapshotInsertValues {
  columns: readonly string[];
  placeholders: string;
  values: unknown[];
}

export interface SnapshotRow {
  snapshot_date: string;
  price_usd: string;
  [column: string]: unknown;
}

export interface SnapshotWriterConfig<T, TLatestSnapshot> {
  tableKey: TableName;
  entityColumn: string;
  entityContextKey: string;
  sourceLiteral: string;
  defaultEntity: string;
  logLabel: string;
  insertFailureMessage: string;
  latestMapFailureMessage: string;
  conflictUpdates: readonly string[];
  buildInsertValues: (records: T[]) => SnapshotInsertValues;
  getEntity: (record: T) => string;
  getSnapshotDate: (record: T) => string;
  getPrice: (record: T) => number;
  getSource: (record: T) => string;
  getEntityIdentifier: (record: T) => Record<string, unknown>;
  getInsertFailureContext: (
    record: T,
    snapshotDate: string,
  ) => Record<string, unknown>;
  mapLatestSnapshot: (row: SnapshotRow) => TLatestSnapshot;
}

export abstract class BaseSnapshotWriter<
  T,
  TLatestSnapshot,
> extends BaseWriter<T> {
  protected abstract readonly snapshotConfig: SnapshotWriterConfig<
    T,
    TLatestSnapshot
  >;

  async insertSnapshot(data: T): Promise<void> {
    const snapshotDate = this.snapshotConfig.getSnapshotDate(data);

    try {
      const result = await this.executeBatchWrite({
        batchNumber: 1,
        logContext: `${this.snapshotConfig.logLabel.toLowerCase()} snapshot`,
        recordCount: 1,
        buildQuery: () => {
          const { columns, placeholders, values } =
            this.snapshotConfig.buildInsertValues([data]);
          const updates = this.snapshotConfig.conflictUpdates
            .map((column) => `${column} = EXCLUDED.${column}`)
            .join(',\n              ');
          const query = `
            INSERT INTO ${this.getSnapshotsTableName()} (${columns.join(', ')})
            VALUES ${placeholders}
            ON CONFLICT (source, ${this.snapshotConfig.entityColumn}, snapshot_date)
            DO UPDATE SET
              ${updates}
            RETURNING id, snapshot_date
          `;
          return { query, values };
        },
      });

      this.assertWriteSuccess(result, 'Unknown insert error');

      this.logSnapshotSaved(this.snapshotConfig.logLabel, {
        priceUsd: this.snapshotConfig.getPrice(data),
        source: this.snapshotConfig.getSource(data),
        date: snapshotDate,
        entityIdentifier: this.snapshotConfig.getEntityIdentifier(data),
      });
    } catch (error) {
      this.logWriteFailureAndRethrow(
        this.snapshotConfig.insertFailureMessage,
        this.snapshotConfig.getInsertFailureContext(data, snapshotDate),
        error,
      );
    }
  }

  async insertBatch(snapshots: T[]): Promise<number> {
    const firstSnapshot = snapshots[0];
    if (!firstSnapshot) {
      return 0;
    }

    const entity = this.snapshotConfig.getEntity(firstSnapshot);
    const context = {
      [this.snapshotConfig.entityContextKey]: entity,
    };
    logger.info('Starting batch insert', {
      total: snapshots.length,
      ...context,
    });

    const { columns, placeholders, values } =
      this.snapshotConfig.buildInsertValues(snapshots);
    const query = `
      INSERT INTO ${this.getSnapshotsTableName()} (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (source, ${this.snapshotConfig.entityColumn}, snapshot_date) DO NOTHING
      RETURNING id;
    `;

    return this.executeStandardBatchInsert(
      query,
      values,
      snapshots.length,
      context,
    );
  }

  async getLatestSnapshot(
    entity = this.snapshotConfig.defaultEntity,
  ): Promise<TLatestSnapshot | null> {
    const query = `
      SELECT snapshot_date, price_usd, ${this.snapshotConfig.entityColumn}
      FROM ${this.getSnapshotsTableName()}
      WHERE source = '${this.snapshotConfig.sourceLiteral}' AND ${this.snapshotConfig.entityColumn} = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;
    const context = {
      [this.snapshotConfig.entityContextKey]: entity,
    };
    const row = await this.queryOptionalRow<SnapshotRow>({
      query,
      values: [entity],
      failureMessage: 'Failed to get latest snapshot',
      failureContext: context,
    });

    if (!row) {
      return null;
    }

    try {
      return this.snapshotConfig.mapLatestSnapshot(row);
    } catch (error) {
      logger.error(this.snapshotConfig.latestMapFailureMessage, {
        ...context,
        error,
      });
      throw error;
    }
  }

  async getSnapshotCount(
    entity = this.snapshotConfig.defaultEntity,
  ): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM ${this.getSnapshotsTableName()}
      WHERE source = '${this.snapshotConfig.sourceLiteral}' AND ${this.snapshotConfig.entityColumn} = $1
    `;
    const context = {
      [this.snapshotConfig.entityContextKey]: entity,
    };
    return this.queryCountOrZero({
      query,
      values: [entity],
      failureMessage: 'Failed to get snapshot count',
      failureContext: context,
    });
  }

  async getExistingDatesInRange(
    startDate: Date,
    endDate: Date,
    entity = this.snapshotConfig.defaultEntity,
    source = this.snapshotConfig.sourceLiteral,
  ): Promise<string[]> {
    return this.queryEntitySnapshotDatesForDates(
      this.getSnapshotsTableName(),
      this.snapshotConfig.entityColumn,
      entity,
      source,
      startDate,
      endDate,
      {
        [this.snapshotConfig.entityContextKey]: entity,
      },
    );
  }

  private getSnapshotsTableName(): string {
    return getTableName(this.snapshotConfig.tableKey);
  }
}
