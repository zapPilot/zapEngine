import { getAllocationCategoryForToken } from '@zapengine/app-core/lib/domain/allocationCategories';
import { describe, expect, it } from 'vitest';

describe('getAllocationCategoryForToken', () => {
  it('routes SPY symbols to the SPY allocation category', () => {
    expect(getAllocationCategoryForToken('SPY')).toBe('spy');
    expect(getAllocationCategoryForToken('spy')).toBe('spy');
  });
});
