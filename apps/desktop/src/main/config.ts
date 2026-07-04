import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { configureAppCoreEnv } from '@zapengine/app-core/lib/env/runtimeEnv';
import { app } from 'electron';

/**
 * Main-process app-core env injection. esbuild bundles app-core into
 * dist/main/main.cjs, so there is no runtime workspace resolution.
 *
 * Precedence (highest first):
 *   1. process.env.ZAP_* (dev / power users)
 *   2. userData config.json (packaged-app override, editable without rebuild)
 *   3. production defaults below
 */

/** ZAP_* env key -> app-core VITE_* key. */
const ENV_KEY_MAP: Record<string, string> = {
  ZAP_ACCOUNT_API_URL: 'VITE_ACCOUNT_API_URL',
  ZAP_ANALYTICS_ENGINE_URL: 'VITE_ANALYTICS_ENGINE_URL',
};

/**
 * Production defaults. TODO(user): fill in the real production URLs before
 * shipping a DMG; empty values make the scheduler no-op with a log line
 * instead of hitting a wrong host.
 */
const PRODUCTION_DEFAULTS: Record<string, string> = {
  VITE_ACCOUNT_API_URL: '',
  VITE_ANALYTICS_ENGINE_URL: '',
};

export type MainEnvDeps = {
  env: Record<string, string | undefined>;
  configFile: Record<string, string> | undefined;
  defaults?: Record<string, string>;
  isPackaged: boolean;
};

/** Pure precedence logic — unit-tested in tests/mainConfig.test.ts. */
export function buildMainEnvSource(
  deps: MainEnvDeps,
): Record<string, string | undefined> {
  const defaults = deps.defaults ?? PRODUCTION_DEFAULTS;
  const source: Record<string, string | undefined> = { ...defaults };

  for (const [viteKey, value] of Object.entries(deps.configFile ?? {})) {
    if (typeof value === 'string') {
      source[viteKey] = value;
    }
  }

  for (const [zapKey, viteKey] of Object.entries(ENV_KEY_MAP)) {
    const value = deps.env[zapKey];
    if (value !== undefined && value !== '') {
      source[viteKey] = value;
    }
  }

  source['VITE_APP_RUNTIME'] = 'desktop';
  source['MODE'] = deps.isPackaged ? 'production' : 'development';
  return source;
}

function readUserConfigFile(): Record<string, string> | undefined {
  try {
    const configPath = join(app.getPath('userData'), 'config.json');
    const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    return parsed as Record<string, string>;
  } catch {
    return undefined;
  }
}

/** Call once at main-process startup, before any app-core service runs. */
export function configureMainAppCoreEnv(): void {
  configureAppCoreEnv(
    buildMainEnvSource({
      env: process.env,
      configFile: readUserConfigFile(),
      isPackaged: app.isPackaged,
    }),
  );
}
