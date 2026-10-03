interface ReadResult {
  data: unknown[] | null;
  error: unknown;
}
const PAGE_SIZE = 1000;
const CHUNK_SIZE = 100;
/** Factories create a fresh query for each range, ordered by a unique id. */
export async function readAllPages(
  query: () => {
    order: (
      column: string,
      options: { ascending: boolean },
    ) => { range: (from: number, to: number) => PromiseLike<ReadResult> };
  },
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await query()
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) {
      throw result.error;
    }
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}
export async function readInChunks(
  ids: readonly string[],
  query: (ids: string[]) => PromiseLike<ReadResult>,
): Promise<unknown[]> {
  const unique = [...new Set(ids)];
  const chunks = Array.from(
    { length: Math.ceil(unique.length / CHUNK_SIZE) },
    (_, i) => unique.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
  );
  return (
    await Promise.all(
      chunks.map(async (chunk) => {
        const result = await query(chunk);
        if (result.error) {
          throw result.error;
        }
        return result.data ?? [];
      }),
    )
  ).flat();
}
