// Narrowing helpers for the untyped JSON this server reads: Supabase `jsonb`
// columns and third-party inspection evidence. Both arrive as unknown trees
// that every consumer has to walk through the same three guards, so they live
// here rather than once per reader.

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const parsed = record(entry);
        return parsed ? [parsed] : [];
      })
    : [];
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
