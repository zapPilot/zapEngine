#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { ENV_MANIFEST, LEGACY_ENV_NAMES } from '../../config/env.manifest.mjs';
import { loadEnvFile, mergeEnv } from './lib.mjs';

const FLY_APPS = {
  'account-engine': 'account-engine',
  'alpha-etl': 'alpha-etl',
  'analytics-engine': 'analytics-engine-xws3ra',
  'podcast-pipeline': 'from-fed-to-chain-api',
};

const [provider, ...args] = process.argv.slice(2);
const apply = args.includes('--apply');
const valueFor = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const target = valueFor('--target');
const environment = valueFor('--environment', 'production');
const repoRoot = path.resolve(import.meta.dirname, '../..');
const env = mergeEnv(loadEnvFile(path.join(repoRoot, '.env')).values);

function selectedValues(selectedTarget, kinds) {
  return Object.fromEntries(
    Object.entries(ENV_MANIFEST)
      .filter(([, definition]) => kinds.includes(definition.kind))
      .filter(([, definition]) => definition.targets.includes(selectedTarget))
      .map(([name]) => [name, env[name]?.trim()])
      .filter(([, value]) => value),
  );
}

function printPlan(label, values) {
  console.log(`${apply ? 'Applying' : 'Dry run'}: ${label}`);
  for (const name of Object.keys(values).sort()) console.log(`  ${name}=<set>`);
  if (!apply)
    console.log('No remote state changed. Re-run with --apply to sync.');
}

if (provider === 'fly') {
  const app = FLY_APPS[target];
  if (!app) {
    console.error(
      `usage: pnpm env:deploy:fly --target ${Object.keys(FLY_APPS).join('|')} [--apply]`,
    );
    process.exit(2);
  }
  const values = selectedValues(target, ['client', 'server']);
  delete values.FLY_APP_NAME;
  printPlan(`Fly app ${app}`, values);
  if (!apply) process.exit(0);

  const input = `${Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`;
  const result = spawnSync('fly', ['secrets', 'import', '--app', app], {
    cwd: path.join(repoRoot, 'apps', target),
    input,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  process.exit(result.status ?? 1);
}

if (provider === 'eas') {
  const values = selectedValues('expo', ['client']);
  printPlan(`EAS ${environment} environment`, values);
  const legacyNames = Object.keys(LEGACY_ENV_NAMES).filter((name) =>
    name.startsWith('EXPO_PUBLIC_'),
  );
  console.log(
    `  Legacy cleanup: ${legacyNames.join(', ')}${apply ? '' : ' (on --apply)'}`,
  );
  if (!apply) process.exit(0);

  for (const [name, value] of Object.entries(values)) {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/eas.mjs',
        'env:create',
        environment,
        '--name',
        name,
        '--value',
        value,
        '--visibility',
        'plaintext',
        '--scope',
        'project',
        '--force',
        '--non-interactive',
      ],
      { cwd: path.join(repoRoot, 'apps/app'), stdio: 'inherit' },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  const listResult = spawnSync(
    process.execPath,
    [
      'scripts/eas.mjs',
      'env:list',
      environment,
      '--format',
      'short',
      '--scope',
      'project',
    ],
    {
      cwd: path.join(repoRoot, 'apps/app'),
      encoding: 'utf8',
    },
  );
  if (listResult.status !== 0) {
    process.stderr.write(
      listResult.stderr ?? 'Unable to list EAS env values.\n',
    );
    process.exit(listResult.status ?? 1);
  }

  for (const name of legacyNames) {
    if (!new RegExp(`(^|\\s)${name}(\\s|$)`, 'mu').test(listResult.stdout)) {
      continue;
    }
    const result = spawnSync(
      process.execPath,
      [
        'scripts/eas.mjs',
        'env:delete',
        environment,
        '--variable-name',
        name,
        '--scope',
        'project',
        '--non-interactive',
      ],
      { cwd: path.join(repoRoot, 'apps/app'), stdio: 'inherit' },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  process.exit(0);
}

console.error('usage: node scripts/env/deploy.mjs <fly|eas> [options]');
process.exit(2);
