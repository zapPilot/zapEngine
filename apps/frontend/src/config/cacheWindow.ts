import { getRuntimeEnv } from "@/lib/env/runtimeEnv";
import { toSeconds } from "@/lib/utils/env";

const DEFAULT_MAX_AGE_SECONDS = toSeconds(
  getRuntimeEnv("VITE_CACHE_MAX_AGE_SECONDS"),
  60 * 60
);

const DEFAULT_STALE_WHILE_REVALIDATE_SECONDS = toSeconds(
  getRuntimeEnv("VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS"),
  23 * 60 * 60
);

export const CACHE_WINDOW = {
  /**
   * Cache-Control max-age (seconds) shared across frontend + backend endpoints.
   * Defaults to 1 hour which bounds worst-case staleness after ETL completes.
   */
  maxAgeSeconds: DEFAULT_MAX_AGE_SECONDS,
  /**
   * Cache-Control stale-while-revalidate (seconds). Keeps cached responses
   * around for the remaining ETL window while allowing background refreshes.
   */
  staleWhileRevalidateSeconds: DEFAULT_STALE_WHILE_REVALIDATE_SECONDS,
  /** React Query staleTime (ms) */
  staleTimeMs: DEFAULT_MAX_AGE_SECONDS * 1000,
  /** React Query gcTime (ms) */
  gcTimeMs:
    (DEFAULT_MAX_AGE_SECONDS + DEFAULT_STALE_WHILE_REVALIDATE_SECONDS) * 1000,
  /**
   * Cache-Control header string reused across headers() + API routes.
   */
  headerValue: `public, max-age=${DEFAULT_MAX_AGE_SECONDS}, stale-while-revalidate=${DEFAULT_STALE_WHILE_REVALIDATE_SECONDS}`,
} as const;
