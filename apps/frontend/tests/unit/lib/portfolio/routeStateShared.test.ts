import { isMember } from '@zapengine/app-core/lib/portfolio/routeStateShared';
import { describe, expect, it } from 'vitest';

describe('isMember', () => {
  const values = ['dashboard', 'invest'] as const;

  it('returns true for values in the readonly member list', () => {
    expect(isMember(values, 'invest')).toBe(true);
  });

  it('returns false for null and unknown values', () => {
    expect(isMember(values, null)).toBe(false);
    expect(isMember(values, 'analytics')).toBe(false);
  });
});
