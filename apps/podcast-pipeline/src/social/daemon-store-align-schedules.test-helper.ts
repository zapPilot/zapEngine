import { vi } from 'vitest';

interface AlignmentSnapshot<T> {
  data: T[] | null;
  error: unknown;
}

export function createAlignmentReadFixture<T>(snapshot: AlignmentSnapshot<T>) {
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
