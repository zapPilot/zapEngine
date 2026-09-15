import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDefaultOptions: vi.fn(),
  setDefaultOptions: vi.fn(),
}));

vi.mock('@core/config/cacheWindow', () => ({
  CACHE_WINDOW: { staleTimeMs: 3_600_000, gcTimeMs: 86_400_000 },
}));

vi.mock('@core/lib/state/queryClient', () => ({
  queryClient: {
    getDefaultOptions: mocks.getDefaultOptions,
    setDefaultOptions: mocks.setDefaultOptions,
  },
}));

async function loadCacheControl() {
  return import('@core/lib/http/cacheControl');
}

describe('parseCacheControlForHint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // Invariant: absent, irrelevant and non-numeric max-age directives cannot
  // overwrite the configured query-cache defaults.
  it.each([undefined, null, '', 'public, immutable', 'max-age=invalid'])(
    'rejects unusable cache control value %s',
    async (value) => {
      const { parseCacheControlForHint } = await loadCacheControl();
      expect(parseCacheControlForHint(value)).toBeNull();
    },
  );

  // Invariant: shared-cache max age is accepted as a fallback, with whitespace
  // and empty directives ignored.
  it('parses s-maxage and stale-while-revalidate', async () => {
    const { parseCacheControlForHint } = await loadCacheControl();

    expect(
      parseCacheControlForHint(
        ' public, , s-maxage=60, stale-while-revalidate=120 ',
      ),
    ).toEqual({ staleTimeMs: 60_000, gcTimeMs: 180_000 });
  });

  // Invariant: max-age wins once observed and a malformed stale extension is
  // treated as absent rather than invalidating an otherwise usable hint.
  it('prefers max-age and ignores an invalid stale extension', async () => {
    const { parseCacheControlForHint } = await loadCacheControl();

    expect(
      parseCacheControlForHint(
        'max-age=30, s-maxage=60, stale-while-revalidate=invalid',
      ),
    ).toEqual({ staleTimeMs: 30_000, gcTimeMs: 30_000 });
  });

  // Invariant: a non-positive total window never manufactures a positive GC
  // extension and instead falls back to the stale-time value.
  it('handles a non-positive cache window', async () => {
    const { parseCacheControlForHint } = await loadCacheControl();
    expect(parseCacheControlForHint('max-age=0')).toEqual({
      staleTimeMs: 0,
      gcTimeMs: 0,
    });
  });
});

describe('syncQueryCacheDefaultsFromHint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.getDefaultOptions.mockReturnValue({ mutations: { retry: 1 } });
  });

  // Invariant: applying the current default hint is a no-op, avoiding a global
  // QueryClient configuration write for every response.
  it('does not reapply the current hint', async () => {
    const { syncQueryCacheDefaultsFromHint } = await loadCacheControl();

    syncQueryCacheDefaultsFromHint({
      staleTimeMs: 3_600_000,
      gcTimeMs: 86_400_000,
    });

    expect(mocks.getDefaultOptions).not.toHaveBeenCalled();
    expect(mocks.setDefaultOptions).not.toHaveBeenCalled();
  });

  // Invariant: a new server hint changes only cache timing, preserving all
  // existing query and mutation defaults, and is applied once.
  it('merges a changed hint into existing defaults once', async () => {
    mocks.getDefaultOptions.mockReturnValue({
      queries: { retry: 2 },
      mutations: { retry: 1 },
    });
    const { syncQueryCacheDefaultsFromHint } = await loadCacheControl();
    const hint = { staleTimeMs: 10_000, gcTimeMs: 30_000 };

    syncQueryCacheDefaultsFromHint(hint);
    syncQueryCacheDefaultsFromHint(hint);

    expect(mocks.setDefaultOptions).toHaveBeenCalledTimes(1);
    expect(mocks.setDefaultOptions).toHaveBeenCalledWith({
      queries: { retry: 2, staleTime: 10_000, gcTime: 30_000 },
      mutations: { retry: 1 },
    });
  });
});

describe('hasHeaders', () => {
  it.each([
    [null, false],
    ['response', false],
    [{}, false],
    [{ headers: {} }, false],
    [{ headers: { get: 'not-a-function' } }, false],
    [{ headers: { get: () => null } }, true],
  ])('classifies header shape %#', async (value, expected) => {
    const { hasHeaders } = await loadCacheControl();
    expect(hasHeaders(value)).toBe(expected);
  });
});
