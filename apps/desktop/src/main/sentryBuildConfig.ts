// Build-time injected config for Sentry main-process bootstrap.
//
// `scripts/build.mjs` replaces `__SENTRY_DESKTOP_DSN__` /
// `__SENTRY_DESKTOP_RELEASE__` with baked string literals via esbuild
// `define`. In dev/test where esbuild has not run, the globals are
// undefined and we fall back to runtime env.
declare const __SENTRY_DESKTOP_DSN__: string | undefined;
declare const __SENTRY_DESKTOP_RELEASE__: string | undefined;

function readBakedDsn(): string | undefined {
  try {
    return typeof __SENTRY_DESKTOP_DSN__ !== 'undefined'
      ? __SENTRY_DESKTOP_DSN__
      : undefined;
  } catch {
    return undefined;
  }
}

function readBakedRelease(): string | undefined {
  try {
    return typeof __SENTRY_DESKTOP_RELEASE__ !== 'undefined'
      ? __SENTRY_DESKTOP_RELEASE__
      : undefined;
  } catch {
    return undefined;
  }
}

export const BAKED_SENTRY_DSN: string | undefined = readBakedDsn();
export const BAKED_SENTRY_RELEASE: string | undefined = readBakedRelease();

/** Pure resolver — unit-tested. Prefers baked build-time value, falls back to runtime env. */
export function resolveSentryDsn(
  baked: string | undefined,
  runtime: string | undefined,
): string | undefined {
  const candidate = baked?.trim() ? baked.trim() : runtime?.trim();
  return candidate && candidate.length > 0 ? candidate : undefined;
}

export function resolveSentryRelease(
  baked: string | undefined,
  runtime: string | undefined,
  appVersion: string,
): string | undefined {
  const candidate = baked?.trim() ? baked.trim() : runtime?.trim();
  if (candidate && candidate.length > 0) {
    return candidate;
  }
  const fallback = appVersion?.trim();
  return fallback && fallback.length > 0 ? fallback : undefined;
}
