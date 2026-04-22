import { describe, expect, it } from 'vitest';

import { createSectionState } from '@/lib/portfolio/sectionHelpers';

describe('createSectionState', () => {
  it('returns loading true when any query is loading', () => {
    const result = createSectionState(
      [{ data: undefined, isLoading: true, error: null }],
      (data: unknown) => data,
    );
    expect(result.isLoading).toBe(true);
    expect(result.data).toBeNull();
  });

  it('returns first error from queries', () => {
    const error = new Error('fail');
    const result = createSectionState(
      [
        { data: 'a', isLoading: false, error: null },
        { data: undefined, isLoading: false, error },
      ] as [any, any],
      (a: unknown, b: unknown) => ({ a, b }),
    );
    expect(result.error).toBe(error);
  });

  it('extracts data when all queries have data', () => {
    const result = createSectionState(
      [{ data: 42, isLoading: false, error: null }],
      (data: number) => data * 2,
    );
    expect(result.data).toBe(84);
    expect(result.isLoading).toBe(false);
    expect(result.error).toBeFalsy();
  });

  it('returns null data when some queries lack data', () => {
    const result = createSectionState(
      [
        { data: 'a', isLoading: false, error: null },
        { data: undefined, isLoading: false, error: null },
      ] as [any, any],
      (a: unknown, b: unknown) => ({ a, b }),
    );
    expect(result.data).toBeNull();
  });

  it('handles extractor returning null', () => {
    const result = createSectionState(
      [{ data: 'test', isLoading: false, error: null }],
      () => null,
    );
    expect(result.data).toBeNull();
  });

  it('works with three query dependencies', () => {
    const result = createSectionState(
      [
        { data: 1, isLoading: false, error: null },
        { data: 2, isLoading: false, error: null },
        { data: 3, isLoading: false, error: null },
      ] as [any, any, any],
      (a: number, b: number, c: number) => a + b + c,
    );
    expect(result.data).toBe(6);
  });

  it('combines loading across multiple queries', () => {
    const result = createSectionState(
      [
        { data: 1, isLoading: false, error: null },
        { data: undefined, isLoading: true, error: null },
      ] as [any, any],
      (a: unknown, b: unknown) => ({ a, b }),
    );
    expect(result.isLoading).toBe(true);
  });
});
