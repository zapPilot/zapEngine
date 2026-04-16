import { describe, it, expect } from 'vitest';
import { buildPortfolioInsertValues } from '../../../../src/core/database/columnDefinitions.js';

describe('buildPortfolioInsertValues', () => {
  it('handles null/undefined values for non-JSON columns', () => {
    const records = [{
      wallet: '0x123',
      // chain missing (undefined) - non-JSON column
      detail: {}, // JSON column
    } as unknown];

    const { values } = buildPortfolioInsertValues(records);
    
    // wallet is index 0 (should be '0x123')
    expect(values[0]).toBe('0x123');
    
    // chain is index 1 (should be null)
    expect(values[1]).toBeNull();
  });
});
