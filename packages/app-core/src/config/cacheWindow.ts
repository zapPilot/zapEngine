import { getRuntimeEnv, toSeconds } from '@core/lib/env/runtimeEnv';

// Resolved lazily (memoized on first touch) so the env injected at app
// bootstrap (configureAppCoreEnv) is honored — module-scope reads would run
// before injection.
let maxAgeSeconds: number | undefined;
let staleWhileRevalidateSeconds: number | undefined;

function getMaxAgeSeconds(): number {
  maxAgeSeconds ??= toSeconds(
    getRuntimeEnv('VITE_CACHE_MAX_AGE_SECONDS'),
    60 * 60,
  );
  return maxAgeSeconds;
}

function getStaleWhileRevalidateSeconds(): number {
  staleWhileRevalidateSeconds ??= toSeconds(
    getRuntimeEnv('VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS'),
    23 * 60 * 60,
  );
  return staleWhileRevalidateSeconds;
}

export const CACHE_WINDOW = {
  /**
   * Cache-Control max-age (seconds) shared across frontend + backend endpoints.
   * Defaults to 1 hour which bounds worst-case staleness after ETL completes.
   */
  get maxAgeSeconds(): number {
    return getMaxAgeSeconds();
  },
  /**
   * Cache-Control stale-while-revalidate (seconds). Keeps cached responses
   * around for the remaining ETL window while allowing background refreshes.
   */
  get staleWhileRevalidateSeconds(): number {
    return getStaleWhileRevalidateSeconds();
  },
  /** React Query staleTime (ms) */
  get staleTimeMs(): number {
    return getMaxAgeSeconds() * 1000;
  },
  /** React Query gcTime (ms) */
  get gcTimeMs(): number {
    return (getMaxAgeSeconds() + getStaleWhileRevalidateSeconds()) * 1000;
  },
  /**
   * Cache-Control header string reused across headers() + API routes.
   */
  get headerValue(): string {
    return `public, max-age=${getMaxAgeSeconds()}, stale-while-revalidate=${getStaleWhileRevalidateSeconds()}`;
  },
} as const;
