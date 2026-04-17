/**
 * Shared utilities for building SQL insert values
 * Eliminates duplication across column definition files
 */

function buildRowPlaceholders(
  startPosition: number,
  columnCount: number,
): string {
  const columns = Array.from(
    { length: columnCount },
    (_, columnIndex) => `$${startPosition + columnIndex}`,
  );
  return `(${columns.join(", ")})`;
}

function toSqlValue<T, K extends keyof T & string>(
  record: T,
  column: K,
  valueTransformer?: (column: K, value: T[K], record: T) => unknown,
): unknown {
  const rawValue = record[column];
  const transformedValue = valueTransformer
    ? valueTransformer(column, rawValue, record)
    : rawValue;

  // Standardize undefined -> null for SQL
  return transformedValue === undefined ? null : transformedValue;
}

/**
 * Build placeholder string for a bulk insert query
 * @param recordCount - Number of records to insert
 * @param columnCount - Number of columns per record
 * @returns Placeholder string like "($1, $2), ($3, $4)"
 */
export function buildPlaceholders(
  recordCount: number,
  columnCount: number,
): string {
  return Array.from({ length: recordCount }, (_, rowIdx) => {
    const start = rowIdx * columnCount + 1;
    return buildRowPlaceholders(start, columnCount);
  }).join(", ");
}

/**
 * Generic insert value builder for any record type
 * @param records - Array of records to insert
 * @param columns - Array of column names (with type safety)
 * @param valueTransformer - Optional function to transform values (e.g., JSON serialization, defaults)
 */
export function buildGenericInsertValues<T, K extends keyof T & string>(
  records: ReadonlyArray<T>,
  columns: ReadonlyArray<K>,
  valueTransformer?: (column: K, value: T[K], record: T) => unknown,
): { columns: ReadonlyArray<K>; placeholders: string; values: unknown[] } {
  const placeholders = buildPlaceholders(records.length, columns.length);

  const values: unknown[] = [];
  for (const record of records) {
    for (const col of columns) {
      values.push(toSqlValue(record, col, valueTransformer));
    }
  }

  return { columns, placeholders, values };
}
