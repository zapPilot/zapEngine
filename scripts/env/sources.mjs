import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { ENV_MANIFEST } from '../../config/env.manifest.mjs';
import { loadEnvFile } from './lib.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function normalizeInfisicalExport(parsed) {
  if (Array.isArray(parsed)) {
    return Object.fromEntries(
      parsed
        .map((entry) => [
          entry.secretKey ?? entry.key,
          entry.secretValue ?? entry.value,
        ])
        .filter(([key, value]) => key && typeof value === 'string'),
    );
  }
  if (parsed && typeof parsed === 'object') {
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string'),
    );
  }
  throw new Error('Infisical returned an unsupported JSON shape');
}

export function loadCommittedValues(environment) {
  return loadEnvFile(
    path.join(repoRoot, 'config', 'env', `${environment}.env`),
  );
}

export function loadInfisicalValues(environment) {
  const projectArgs = process.env.INFISICAL_PROJECT_ID
    ? [`--projectId=${process.env.INFISICAL_PROJECT_ID}`]
    : [];
  const result = spawnSync(
    'infisical',
    [
      'export',
      `--env=${environment}`,
      '--path=/',
      '--format=json',
      '--silent',
      ...projectArgs,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, INFISICAL_DISABLE_UPDATE_CHECK: 'true' },
    },
  );
  if (result.error?.code === 'ENOENT') {
    throw new Error('not checkable: install the Infisical CLI');
  }
  if (result.status !== 0) {
    throw new Error('not checkable: authenticate Infisical for this workspace');
  }
  try {
    return normalizeInfisicalExport(JSON.parse(result.stdout));
  } catch {
    throw new Error('not checkable: Infisical did not return valid JSON');
  }
}

export function resolveValues(environment, { includeSecrets = true } = {}) {
  const committed = loadCommittedValues(environment);
  if (committed.duplicates.length > 0) {
    throw new Error(
      `${environment}: duplicate committed keys: ${[...new Set(committed.duplicates)].join(', ')}`,
    );
  }
  const secrets = includeSecrets ? loadInfisicalValues(environment) : {};
  const duplicateSources = Object.keys(committed.values).filter((name) =>
    Object.hasOwn(secrets, name),
  );
  if (duplicateSources.length > 0) {
    throw new Error(
      `${environment}: keys exist in Git and Infisical: ${duplicateSources.sort().join(', ')}`,
    );
  }
  const values = { ...committed.values, ...secrets };
  const unmanaged = Object.keys(values).filter(
    (name) => !Object.hasOwn(ENV_MANIFEST, name),
  );
  if (unmanaged.length > 0) {
    throw new Error(
      `${environment}: unmanaged source keys: ${unmanaged.sort().join(', ')}`,
    );
  }
  return values;
}
