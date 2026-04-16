import { describe, it, expect } from 'vitest';
import { buildGenericInsertValues } from '../../../../src/core/database/columnHelpers.js';

describe('columnHelpers', () => {
  it('should coerce undefined values to null for SQL compatibility', () => {
    interface TestRecord {
      name: string;
      optional_field: string | undefined;
    }

    const records: TestRecord[] = [
      { name: 'test', optional_field: undefined },
    ];

    const result = buildGenericInsertValues(
      records,
      ['name', 'optional_field'] as const
    );

    expect(result.values).toEqual(['test', null]);
  });

  it('should preserve non-undefined values unchanged', () => {
    const records = [{ a: 'hello', b: 0, c: null, d: false }];

    const result = buildGenericInsertValues(
      records,
      ['a', 'b', 'c', 'd'] as const
    );

    expect(result.values).toEqual(['hello', 0, null, false]);
  });
});
