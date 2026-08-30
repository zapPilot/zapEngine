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

export interface AlignmentUpdateRecord {
  id: string | undefined;
  status: string | undefined;
  patch: Record<string, unknown>;
}

interface AlignmentUpdateResult {
  data: { id: string } | null;
  error: unknown;
}

interface AlignmentUpdateFixture {
  update: MockFn;
  updates: AlignmentUpdateRecord[];
}

function acceptWrite(record: AlignmentUpdateRecord): AlignmentUpdateResult {
  return { data: record.id ? { id: record.id } : null, error: null };
}

/**
 * The alignment writer is a compare-and-swap: `update(patch).eq('id', …)
 * .eq('status', …).select().maybeSingle()` returns a row only when the status
 * fence still matches. Tests care about the recorded {id, status, patch}
 * triples and about forcing CAS misses, so `resolve` owns that decision.
 */
export function createAlignmentUpdateFixture(
  resolve: (
    record: AlignmentUpdateRecord,
    attempt: number,
  ) => AlignmentUpdateResult = acceptWrite,
): AlignmentUpdateFixture {
  const updates: AlignmentUpdateRecord[] = [];
  let attempt = 0;

  const update = vi.fn((patch: Record<string, unknown>) => {
    let id: string | undefined;
    let status: string | undefined;
    const maybeSingle = vi.fn(async () => {
      const record: AlignmentUpdateRecord = { id, status, patch };
      updates.push(record);
      attempt += 1;
      return resolve(record, attempt);
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const builder = {
      eq(field: string, value: string) {
        if (field === 'id') id = value;
        if (field === 'status') status = value;
        return builder;
      },
      select,
    };
    return builder;
  });

  return { update, updates };
}
