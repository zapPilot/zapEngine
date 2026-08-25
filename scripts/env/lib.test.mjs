import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  migrateEnvFile,
  parseEnv,
  projectEnv,
  validateEnv,
} from './lib.mjs';

test('parseEnv handles exports, quotes, comments, and duplicates', () => {
  const parsed = parseEnv(
    "A=one\nexport B='two # literal'\nA=three # comment\n",
  );
  assert.deepEqual(parsed.values, { A: 'three', B: 'two # literal' });
  assert.deepEqual(parsed.duplicates, ['A']);
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
  assert.ok(turbo.globalEnv.includes('ACCOUNT_API_URL'));
  assert.ok(turbo.tasks.build.env.includes('VITE_*'));
  assert.ok(turbo.tasks.build.env.includes('EXPO_PUBLIC_*'));
  assert.ok(turbo.tasks.build.env.includes('NEXT_PUBLIC_*'));
});

test('.env.example contains canonical names only', async () => {
  const example = await readFile(
    new URL('../../.env.example', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    example,
    /^(?:VITE_|EXPO_PUBLIC_|NEXT_PUBLIC_|ZAP_(?:ACCOUNT|ANALYTICS))/mu,
  );
});

test('validateEnv rejects human-maintained legacy aliases', () => {
  assert.match(
    validateEnv({ VITE_ACCOUNT_API_URL: 'x' }).errors[0],
    /ACCOUNT_API_URL/u,
  );
});

test('migrateEnvFile preserves an existing canonical value and removes legacy aliases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zap-env-migrate-'));
  const envPath = join(directory, '.env');

  try {
    await writeFile(
      envPath,
      [
        'VITE_ACCOUNT_API_URL=https://legacy-vite',
        'ACCOUNT_API_URL=https://canonical',
        'EXPO_PUBLIC_ACCOUNT_API_URL=https://legacy-expo',
        'UNRELATED=value',
        '',
      ].join('\n'),
    );

    migrateEnvFile(envPath);
    const migrated = await readFile(envPath, 'utf8');

    assert.equal(
      migrated,
      'ACCOUNT_API_URL=https://canonical\nUNRELATED=value\n',
    );

    migrateEnvFile(envPath);
    assert.equal(await readFile(envPath, 'utf8'), migrated);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('migrateEnvFile collapses equal legacy aliases into one canonical value', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zap-env-migrate-'));
  const envPath = join(directory, '.env');

  try {
    await writeFile(
      envPath,
      [
        'VITE_ACCOUNT_API_URL=https://shared-account',
        'EXPO_PUBLIC_ACCOUNT_API_URL=https://shared-account',
        'UNRELATED=value',
        '',
      ].join('\n'),
    );

    migrateEnvFile(envPath);
    const migrated = await readFile(envPath, 'utf8');

    assert.equal(
      migrated,
      'ACCOUNT_API_URL=https://shared-account\nUNRELATED=value\n',
    );

    migrateEnvFile(envPath);
    assert.equal(await readFile(envPath, 'utf8'), migrated);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('migrateEnvFile rejects conflicting legacy aliases before rewriting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zap-env-migrate-'));
  const envPath = join(directory, '.env');
  const original = [
    'VITE_ACCOUNT_API_URL=https://legacy-vite',
    'EXPO_PUBLIC_ACCOUNT_API_URL=https://legacy-expo',
    'UNRELATED=value',
    '',
  ].join('\n');

  try {
    await writeFile(envPath, original);

    assert.throws(
      () => migrateEnvFile(envPath),
      /Conflicting legacy values for ACCOUNT_API_URL/u,
    );
    assert.equal(await readFile(envPath, 'utf8'), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
