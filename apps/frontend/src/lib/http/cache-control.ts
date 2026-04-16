import { CACHE_WINDOW } from "@/config/cacheWindow";
import { queryClient } from "@/lib/state/queryClient";

export interface CacheHint {
  staleTimeMs: number;
  gcTimeMs: number;
}

export interface ResponseLikeWithHeaders {
  headers?: { get?: (name: string) => string | null };
}

const DEFAULT_CACHE_HINT: CacheHint = {
  staleTimeMs: CACHE_WINDOW.staleTimeMs,
  gcTimeMs: CACHE_WINDOW.gcTimeMs,
};

let appliedCacheHint: CacheHint = DEFAULT_CACHE_HINT;

function parseDirectiveSeconds(
  directive: string,
  key: string
): number | undefined {
  if (!directive.startsWith(key)) {
    return undefined;
  }

  const parsed = Number(directive.slice(key.length));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseCacheControlForHint(
  value?: string | null
): CacheHint | null {
  if (!value) {
    return null;
  }

  const directives = value
    .toLowerCase()
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);

  let maxAgeSeconds: number | undefined;
  let staleWhileRevalidateSeconds: number | undefined;

  for (const directive of directives) {
    if (maxAgeSeconds === undefined) {
      maxAgeSeconds =
        parseDirectiveSeconds(directive, "max-age=") ??
        parseDirectiveSeconds(directive, "s-maxage=");
      if (maxAgeSeconds !== undefined) continue;
    }

    if (staleWhileRevalidateSeconds === undefined) {
      staleWhileRevalidateSeconds = parseDirectiveSeconds(
        directive,
        "stale-while-revalidate="
      );
    }
  }

  if (maxAgeSeconds === undefined) {
    return null;
  }

  const staleTimeMs = maxAgeSeconds * 1000;
  const totalSeconds = maxAgeSeconds + (staleWhileRevalidateSeconds ?? 0);
  const gcTimeMs = totalSeconds > 0 ? totalSeconds * 1000 : staleTimeMs;

  return {
    staleTimeMs,
    gcTimeMs,
  };
}

export function syncQueryCacheDefaultsFromHint(hint: CacheHint): void {
  if (
    appliedCacheHint.staleTimeMs === hint.staleTimeMs &&
    appliedCacheHint.gcTimeMs === hint.gcTimeMs
  ) {
    return;
  }

  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...defaults,
    queries: {
      ...(defaults.queries ?? {}),
      staleTime: hint.staleTimeMs,
      gcTime: hint.gcTimeMs,
    },
  });

  appliedCacheHint = hint;
}

export function hasHeaders(value: unknown): value is ResponseLikeWithHeaders {
  return (
    typeof value === "object" &&
    value !== null &&
    "headers" in value &&
    typeof (value as ResponseLikeWithHeaders).headers?.get === "function"
  );
}
