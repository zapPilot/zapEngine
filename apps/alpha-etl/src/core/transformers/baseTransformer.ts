import { logger } from '../../utils/logger.js';

/**
 * Shared batch transformation helper with logging
 * Eliminates duplicate transformBatch patterns across transformers
 *
 * @param items - Array of items to transform
 * @param transform - Transform function for a single item
 * @param context - Context string for logging (e.g., 'pool data', 'wallet balance')
 * @returns Array of successfully transformed items (nulls filtered out)
 */
export function transformBatchWithLogging<TIn, TOut>(
  items: TIn[],
  transform: (item: TIn) => TOut | null,
  context: string,
): TOut[] {
  const results: TOut[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const item of items) {
    const transformed = transform(item);
    if (transformed) {
      results.push(transformed);
      successCount++;
      continue;
    }
    errorCount++;
  }

  logger.info(`${context} batch transformation completed`, {
    total: items.length,
    success: successCount,
    errors: errorCount,
  });

  return results;
}
