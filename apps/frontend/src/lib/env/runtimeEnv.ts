type EnvValue = string | boolean | undefined;

type EnvRecord = Record<string, EnvValue>;

const MODE_ALIASES = {
  development: "development",
  production: "production",
  test: "test",
} as const;

function readImportMetaEnv(key: string): EnvValue {
  return (import.meta.env as EnvRecord | undefined)?.[key];
}

function readProcessEnv(key: string): EnvValue {
  if (typeof process === "undefined") {
    return undefined;
  }

  return process.env[key];
}

/**
 * Read a runtime environment variable.
 *
 * Checks `import.meta.env` first (Vite client), then `process.env` (Node/test).
 *
 * @param key - Environment variable name to read (use the `VITE_` prefix).
 * @returns The string value, if present.
 *
 * @example
 * ```ts
 * const apiUrl = getRuntimeEnv("VITE_API_URL");
 * ```
 */
export function getRuntimeEnv(key: string): string | undefined {
  const importMetaValue = readImportMetaEnv(key);
  if (typeof importMetaValue === "string") {
    return importMetaValue;
  }

  const processValue = readProcessEnv(key);
  if (typeof processValue === "string") {
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
  const processMode = readProcessEnv("NODE_ENV");
  if (typeof processMode === "string" && processMode.length > 0) {
    return processMode;
  }

  const importMetaMode = readImportMetaEnv("MODE");
  if (typeof importMetaMode === "string" && importMetaMode.length > 0) {
    return importMetaMode;
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
  mode: "development" | "production" | "test"
): boolean {
  return getRuntimeMode() === MODE_ALIASES[mode];
}
