import { throwSupabaseError } from './supabase-client.js';

/**
 * Unwraps a Supabase list-shaped query (`.select()`, `.returns<T[]>()`, an RPC
 * that returns `setof`, …): throws on error, defaults a null result to `[]`.
 */
export async function many<T>(
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throwSupabaseError(error);
  }
  return data ?? [];
}

/**
 * Unwraps a Supabase single-row-shaped query (`.maybeSingle()`, `.single()`,
 * an RPC returning at most one row): throws on error, returns the row or
 * `null` as-is.
 */
export async function maybeOne<T>(
  query: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    throwSupabaseError(error);
  }
  return data;
}

/** Unwraps a Supabase mutation whose result carries no row, throwing on error. */
export async function expectNoError(
  query: PromiseLike<{ error: unknown }>,
): Promise<void> {
  const { error } = await query;
  if (error) {
    throwSupabaseError(error);
  }
}
