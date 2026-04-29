import type { MacroFearGreedSnapshotInsert } from '../../types/database.js';
import type { MacroFearGreedData } from './schema.js';

export class MacroFearGreedTransformer {
  transform(data: MacroFearGreedData): MacroFearGreedSnapshotInsert {
    return {
      snapshot_date: data.updatedAt.slice(0, 10),
      score: data.score,
      normalized_score: data.normalizedScore,
      label: data.label,
      source: data.source,
      provider_updated_at: data.updatedAt,
      raw_rating: data.rawRating,
      raw_data: {
        original_data: data.rawData,
        transformed_at: new Date().toISOString(),
      },
    };
  }

  transformBatch(data: MacroFearGreedData[]): MacroFearGreedSnapshotInsert[] {
    return data.map((item) => this.transform(item));
  }
}
