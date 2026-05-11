import { describe, expect, it } from 'vitest';

import { getAllocationCategoryForToken } from '@/lib/domain/allocationCategories';

describe('getAllocationCategoryForToken', () => {
  it('routes SPY symbols to the SPY allocation category', () => {
    expect(getAllocationCategoryForToken('SPY')).toBe('spy');
    expect(getAllocationCategoryForToken('spy')).toBe('spy');
  });
});
