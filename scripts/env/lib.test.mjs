import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  auditSecretClassification,
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
  assert.ok(
    errors.includes('TTS_PROVIDER is required for podcast-pipeline:base'),
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

test('production validation rejects local endpoints and placeholders', () => {
  const errors = validateProductionEnv({
    ACCOUNT_API_URL: 'http://localhost:3004',
    LIFI_INTEGRATOR: 'your-integrator',
  });
  assert.ok(errors.some((error) => error.includes('ACCOUNT_API_URL')));
  assert.ok(errors.some((error) => error.includes('LIFI_INTEGRATOR')));
});
