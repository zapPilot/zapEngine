type EnvValue = string | boolean | undefined;

type EnvRecord = Record<string, EnvValue>;

export type AppRuntime = 'web' | 'desktop' | 'native';

const MODE_ALIASES = {
  development: 'development',
  production: 'production',
  test: 'test',
} as const;

const DEFAULT_APP_RUNTIME: AppRuntime = 'web';
const APP_RUNTIME_ENV_KEY = 'VITE_APP_RUNTIME';
const APP_RUNTIMES = new Set<AppRuntime>(['web', 'desktop', 'native']);

// Injected by the host app at bootstrap. This package must stay free of
// Vite-specific globals so it loads on any platform (web, desktop, native, Node).
let injectedEnv: EnvRecord | undefined;

/**
 * Inject the environment map app-core reads from.
 *
 * Call once at app bootstrap, before any other app-core module evaluates:
 * Vite apps pass their build-time env object (see `src/bootstrap/appCoreEnv.ts`
 * in frontend/desktop); native runtimes pass an explicit literal map
 * (including `MODE`).
 *
 * @param source - Environment map to read from.
 */
export function configureAppCoreEnv(source: EnvRecord): void {
  injectedEnv = source;
}

function readInjectedEnv(key: string): EnvValue {
  return injectedEnv?.[key];
}

function readProcessEnv(key: string): EnvValue {
  if (typeof process === 'undefined') {
    return undefined;
  }

  return process.env[key];
}

/**
 * Read a runtime environment variable.
 *
 * Checks the injected env first (see {@link configureAppCoreEnv}), then
 * `process.env` (Node/test).
 *
 * @param key - Environment variable name to read (use the `VITE_` prefix).
 * @returns The string value, if present.
 *
 * @example
 * ```ts
 * const apiUrl = getRuntimeEnv("VITE_ACCOUNT_API_URL");
 * ```
 */
export function getRuntimeEnv(key: string): string | undefined {
  const injectedValue = readInjectedEnv(key);
  if (typeof injectedValue === 'string') {
    return injectedValue;
  }

  const processValue = readProcessEnv(key);
  if (typeof processValue === 'string') {
    return processValue;
  }

  return undefined;
}

/**
 * Resolve the current runtime mode in a way that works in Vite, Vitest, and Node.
 *
 * @returns One of `development`, `production`, `test`, or the raw mode string.
 *
 * @example
 * ```ts
 * if (getRuntimeMode() === "development") {
 *   console.debug("debug mode");
 * }
 * ```
 */
function getRuntimeMode(): string {
  const processMode = readProcessEnv('NODE_ENV');
  if (typeof processMode === 'string' && processMode.length > 0) {
    return processMode;
  }

  const injectedMode = readInjectedEnv('MODE');
  if (typeof injectedMode === 'string' && injectedMode.length > 0) {
    return injectedMode;
  }

  return MODE_ALIASES.development;
}

/**
 * Determine whether the current runtime matches a specific mode.
 *
 * @param mode - Runtime mode to compare against.
 * @returns `true` when the active mode matches.
 *
 * @example
 * ```ts
 * const isProd = isRuntimeMode("production");
 * ```
 */
export function isRuntimeMode(
  mode: 'development' | 'production' | 'test',
): boolean {
  return getRuntimeMode() === MODE_ALIASES[mode];
}

function isAppRuntime(value: string): value is AppRuntime {
  return APP_RUNTIMES.has(value as AppRuntime);
}

export function getAppRuntime(): AppRuntime {
  const runtime = getRuntimeEnv(APP_RUNTIME_ENV_KEY);

  if (runtime && isAppRuntime(runtime)) {
    return runtime;
  }

  return DEFAULT_APP_RUNTIME;
}

export function isDesktopRuntime(): boolean {
  return getAppRuntime() === 'desktop';
}

/**
 * Convert an environment variable string to seconds, with a fallback value.
 *
 * @param value - Environment variable value to parse.
 * @param fallback - Fallback value when parsing fails or value is undefined.
 * @returns Parsed seconds, or the fallback.
 *
 * @example
 * ```ts
 * const maxAge = toSeconds("3600", 3600);
 * ```
 */
export function toSeconds(value: string | undefined, fallback: number): number {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}
