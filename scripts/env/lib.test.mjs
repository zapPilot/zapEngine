import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  auditSecretClassification,
  buildClientTargetEnv,
  DESKTOP_PRODUCTION_CORS_ORIGIN,
  parseEnv,
  projectEnv,
  validateEnv,
  validateProductionEnv,
} from './lib.mjs';

test('parseEnv handles exports, quotes, comments, and duplicates', () => {
  const parsed = parseEnv(
    "A=one\nexport B='two # literal'\nA=three # comment\n",
  );
  assert.deepEqual(parsed.values, { A: 'three', B: 'two # literal' });
  assert.deepEqual(parsed.duplicates, ['A']);
});

test('parseEnv preserves quoted hash literals before trailing comments', () => {
  const parsed = parseEnv(
    'A="two # literal" # trailing\nB=\'three # literal\' # trailing\n',
  );
  assert.deepEqual(parsed.values, {
    A: 'two # literal',
    B: 'three # literal',
  });
});

test('projectEnv exposes only declared client values', () => {
  const projected = projectEnv(
    { ACCOUNT_API_URL: 'https://account', SUPABASE_SERVICE_ROLE_KEY: 'secret' },
    'expo',
  );
  assert.deepEqual(projected, {
    EXPO_PUBLIC_ACCOUNT_API_URL: 'https://account',
  });
});

test('client target env strips server secrets and unrelated client values', () => {
  const env = buildClientTargetEnv(
    {
      ACCOUNT_API_URL: 'https://account.example',
      ANALYTICS_ENGINE_URL: 'https://analytics.example',
      PRIVY_WEB_APP_ID: 'privy-web',
      PRIVY_MOBILE_APP_ID: 'privy-mobile',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
      OPENROUTER_API_KEY: 'openrouter-secret',
      SENTRY_DESKTOP_DSN: 'desktop-dsn',
      SENTRY_ZAP_PILOT_NATIVE_DSN: 'native-dsn',
      APP_COMMIT_SHA: 'abc123',
      ZAP_ELECTRON_LOOPBACK_PORT: '3105',
    },
    'desktop',
    {
      PATH: '/usr/bin',
      HOME: '/tmp/home',
      SUPABASE_SERVICE_ROLE_KEY: 'already-in-parent',
      EXPO_PUBLIC_PRIVY_CLIENT_ID: 'stale-mobile-client-id',
      VITE_ACCOUNT_API_URL: 'stale-account-url',
      GH_TOKEN: 'unmanaged-github-secret',
      NPM_TOKEN: 'unmanaged-npm-secret',
    },
  );

  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.HOME, '/tmp/home');
  assert.equal(env.ACCOUNT_API_URL, 'https://account.example');
  assert.equal(env.VITE_ACCOUNT_API_URL, 'https://account.example');
  assert.equal(env.EXPO_PUBLIC_ACCOUNT_API_URL, 'https://account.example');
  assert.equal(env.PRIVY_WEB_APP_ID, 'privy-web');
  assert.equal(env.VITE_PRIVY_APP_ID, 'privy-web');
  assert.equal(env.APP_COMMIT_SHA, 'abc123');
  assert.equal(env.ZAP_ELECTRON_LOOPBACK_PORT, '3105');

  // The Electron main process reads VITE_*, its renderer reads EXPO_PUBLIC_*,
  // and neither may pick up the native app's DSN.
  assert.equal(env.VITE_SENTRY_DSN, 'desktop-dsn');
  assert.equal(env.EXPO_PUBLIC_SENTRY_DSN, 'desktop-dsn');
  assert.equal(env.SENTRY_ZAP_PILOT_NATIVE_DSN, undefined);

  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(env.PRIVY_MOBILE_APP_ID, undefined);
  assert.equal(env.EXPO_PUBLIC_PRIVY_CLIENT_ID, undefined);
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.NPM_TOKEN, undefined);
});

test('validateEnv applies capability-specific requirements', () => {
  const errors = validateEnv(
    {},
    { target: 'podcast-pipeline', capability: 'fish-audio' },
  ).errors;
  assert.ok(
    errors.includes(
      'FISH_AUDIO_API_KEY is required for podcast-pipeline:fish-audio',
    ),
  );
});

test('manifest never projects server or host values to a client bundle', async () => {
  const { ENV_MANIFEST } = await import('../../config/env.manifest.mjs');
  for (const definition of Object.values(ENV_MANIFEST)) {
    if (definition.kind !== 'client') {
      assert.deepEqual(definition.projections, {});
    }
  }
});

test('Turbo hashes canonical values and receives projected bundler values', async () => {
  const turbo = JSON.parse(
    await readFile(new URL('../../turbo.json', import.meta.url), 'utf8'),
  );
  assert.ok(turbo.globalDependencies.includes('.env*'));
  assert.ok(turbo.globalDependencies.includes('config/env*.mjs'));
  assert.ok(turbo.globalDependencies.includes('config/env/*.env'));
  assert.ok(turbo.globalEnv.includes('ACCOUNT_API_URL'));
  assert.ok(turbo.tasks.build.env.includes('VITE_*'));
  assert.ok(turbo.tasks.build.env.includes('EXPO_PUBLIC_*'));
  assert.ok(turbo.tasks.build.env.includes('NEXT_PUBLIC_*'));
});

test('validateEnv rejects human-maintained legacy aliases', () => {
  assert.match(
    validateEnv({ VITE_ACCOUNT_API_URL: 'x' }).errors[0],
    /ACCOUNT_API_URL/u,
  );
});

test('secret classification rejects sensitive and credential-like committed values', () => {
  const errors = auditSecretClassification({
    dev: {
      values: {
        SUPABASE_SERVICE_ROLE_KEY: 'secret',
        ACCOUNT_API_URL: 'a'.repeat(48),
      },
      duplicates: [],
    },
  });
  assert.ok(
    errors.some((error) => error.includes('SUPABASE_SERVICE_ROLE_KEY')),
  );
  assert.ok(errors.some((error) => error.includes('credential-like')));
});

test('secret classification allows committed public EVM address lists', () => {
  const errors = auditSecretClassification({
    prod: {
      values: {
        TRACK_RECORD_WALLET_ADDRESSES:
          '0x0000000000000000000000000000000000000001, 0x0000000000000000000000000000000000000002',
      },
      duplicates: [],
    },
  });
  assert.deepEqual(errors, []);
});

test('secret classification still rejects 0x-prefixed private-key-shaped values', () => {
  const errors = auditSecretClassification({
    prod: {
      values: {
        TRACK_RECORD_WALLET_ADDRESSES: `0x${'a'.repeat(64)}`,
      },
      duplicates: [],
    },
  });
  assert.ok(errors.some((error) => error.includes('credential-like')));
});

test('production validation rejects local endpoints and placeholders', () => {
  const errors = validateProductionEnv({
    ACCOUNT_API_URL: 'http://localhost:3004',
    LIFI_INTEGRATOR: 'your-integrator',
  });
  assert.ok(errors.some((error) => error.includes('ACCOUNT_API_URL')));
  assert.ok(errors.some((error) => error.includes('LIFI_INTEGRATOR')));
});

test('production validation allows only the packaged desktop loopback CORS origin', () => {
  assert.equal(
    DESKTOP_PRODUCTION_CORS_ORIGIN,
    'http://127.0.0.1:3105',
  );
  const allowed = validateProductionEnv({
    CORS_ALLOWED_ORIGINS: `https://app.zap-pilot.org,${DESKTOP_PRODUCTION_CORS_ORIGIN}`,
    PLAN_SIMULATION_REQUIRED: 'true',
  });
  assert.ok(
    !allowed.some((error) => error.includes('CORS_ALLOWED_ORIGINS')),
    `unexpected CORS error: ${allowed.join('; ')}`,
  );

  const rejected = validateProductionEnv({
    CORS_ALLOWED_ORIGINS: `https://app.zap-pilot.org,${DESKTOP_PRODUCTION_CORS_ORIGIN},http://localhost:3000`,
    PLAN_SIMULATION_REQUIRED: 'true',
  });
  assert.ok(
    rejected.some((error) =>
      error.includes('CORS_ALLOWED_ORIGINS contains a local-only host'),
    ),
  );
});
