import { vi } from 'vitest';

interface AlignmentSnapshot<T> {
  data: T[] | null;
  error: unknown;
}

type AlignmentSnapshotSource<T> =
  | AlignmentSnapshot<T>
  | (() => AlignmentSnapshot<T> | Promise<AlignmentSnapshot<T>>);

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
  snapshot: AlignmentSnapshotSource<T>,
  update: MockFn = vi.fn(),
): AlignmentReadFixture {
  const returns = vi.fn(async () =>
    typeof snapshot === 'function' ? await snapshot() : snapshot,
  );
  const inFilter = vi.fn(() => ({ returns }));
  const select = vi.fn(() => ({ in: inFilter }));
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
