import { vi } from 'vitest';

interface AlignmentSnapshot<T> {
  data: T[] | null;
  error: unknown;
}

type MockFn = ReturnType<typeof vi.fn>;

interface AlignmentReadFixture {
  client: { from: MockFn };
  from: MockFn;
  inFilter: MockFn;
  returns: MockFn;
  select: MockFn;
  update: MockFn;
}

export function createAlignmentReadFixture<T>(
  snapshot: AlignmentSnapshot<T>,
): AlignmentReadFixture {
  const returns = vi.fn(async () => snapshot);
  const inFilter = vi.fn(() => ({ returns }));
  const select = vi.fn(() => ({ in: inFilter }));
  const update = vi.fn();
  const from = vi.fn(() => ({ select, update }));

  return {
    client: { from },
    from,
    inFilter,
    returns,
    select,
    update,
  };
}
