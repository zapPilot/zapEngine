import { getTableName } from '../../config/database.js';
import {
  BaseWriter,
  type WriteResult,
} from '../../core/database/baseWriter.js';
import { buildMacroFearGreedInsertValues } from '../../core/database/columnDefinitions.js';
import type { MacroFearGreedSnapshotInsert } from '../../types/database.js';
import { logger } from '../../utils/logger.js';
import type { MacroFearGreedData, MacroFearGreedLabel } from './schema.js';

export class MacroFearGreedWriter extends BaseWriter<MacroFearGreedSnapshotInsert> {
  async writeSnapshots(
    snapshots: MacroFearGreedSnapshotInsert[],
  ): Promise<WriteResult> {
    return this.processBatches(
      snapshots,
      this.writeBatch.bind(this),
      'macro Fear & Greed snapshots',
    );
  }

  async getLatestSnapshot(
    maxAgeSeconds?: number,
  ): Promise<MacroFearGreedData | null> {
    const query = `
      SELECT score, normalized_score, label, source, provider_updated_at, raw_rating, raw_data
      FROM ${getTableName('MACRO_FEAR_GREED_SNAPSHOTS')}
      WHERE ($1::interval IS NULL OR provider_updated_at >= NOW() - $1::interval)
      ORDER BY provider_updated_at DESC
      LIMIT 1
    `;
    const interval = maxAgeSeconds == null ? null : `${maxAgeSeconds} seconds`;
    const result = await this.withDatabaseClient((client) =>
      client.query<{
        score: string;
        normalized_score: number;
        label: MacroFearGreedLabel;
        source: string;
        provider_updated_at: Date | string;
        raw_rating: string | null;
        raw_data: Record<string, unknown> | null;
      }>(query, [interval]),
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const updatedAt =
      row.provider_updated_at instanceof Date
        ? row.provider_updated_at.toISOString()
        : new Date(row.provider_updated_at).toISOString();
    return {
      score: Number(row.score),
      normalizedScore: row.normalized_score,
      label: row.label,
      source: row.source,
      updatedAt,
      rawRating: row.raw_rating,
      rawData: row.raw_data ?? {},
    };
  }

  private async writeBatch(
    batch: MacroFearGreedSnapshotInsert[],
    batchNumber: number,
  ): Promise<WriteResult> {
    const validRecords = batch.filter(
      (record) => record.source && record.label,
    );
    if (validRecords.length === 0) {
      return {
        success: true,
        recordsInserted: 0,
        errors: [],
        duplicatesSkipped: batch.length,
      };
    }
    logger.debug('Writing macro Fear & Greed batch', {
      batchNumber,
      recordCount: validRecords.length,
    });
    return this.executeBatchWrite({
      batchNumber,
      logContext: 'macro Fear & Greed snapshots',
      recordCount: validRecords.length,
      buildQuery: () => {
        const { columns, placeholders, values } =
          buildMacroFearGreedInsertValues(validRecords);
        const query = `
          INSERT INTO ${getTableName('MACRO_FEAR_GREED_SNAPSHOTS')} (${columns.join(', ')})
          VALUES ${placeholders}
          ON CONFLICT (source, snapshot_date)
          DO UPDATE SET
            score = EXCLUDED.score,
            normalized_score = EXCLUDED.normalized_score,
            label = EXCLUDED.label,
            provider_updated_at = EXCLUDED.provider_updated_at,
            raw_rating = EXCLUDED.raw_rating,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()
          RETURNING id;
        `;
        return { query, values };
      },
    });
  }
}
