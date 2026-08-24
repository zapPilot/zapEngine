#!/usr/bin/env node
import path from 'node:path';

import { ENV_MANIFEST, ENV_TARGETS } from '../../config/env.manifest.mjs';
import {
  loadEnvFile,
  mergeEnv,
  migrateEnvFile,
  projectEnv,
  validateEnv,
} from './lib.mjs';

const [command = 'check', ...args] = process.argv.slice(2);
const repoRoot = path.resolve(import.meta.dirname, '../..');
const envPath = path.join(repoRoot, '.env');
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const target = option('--target');
const capability = option('--capability');

if (target && !ENV_TARGETS.includes(target)) {
  console.error(
    `Unknown target ${target}. Expected one of: ${ENV_TARGETS.join(', ')}`,
  );
  process.exit(2);
}

if (command === 'migrate') {
  migrateEnvFile(envPath);
  console.log('Migrated .env to canonical names.');
  process.exit(0);
}

if (command === 'mappings') {
  for (const [name, definition] of Object.entries(ENV_MANIFEST)) {
    console.log(
      [name, definition.kind, ...Object.values(definition.projections)].join(
        '|',
      ),
    );
  }
  process.exit(0);
}

if (command === 'audit-example') {
  const example = loadEnvFile(path.join(repoRoot, '.env.example'));
  const expected = new Set(
    Object.entries(ENV_MANIFEST)
      .filter(([, definition]) => definition.documented !== false)
      .map(([name]) => name),
  );
  const actual = new Set(Object.keys(example.values));
  const errors = [
    ...[...expected]
      .filter((name) => !actual.has(name))
      .map((name) => `${name} is missing from .env.example`),
    ...[...actual]
      .filter((name) => !expected.has(name))
      .map((name) => `${name} is not declared in the manifest`),
    ...example.duplicates.map(
      (name) => `${name} is duplicated in .env.example`,
    ),
  ];
  for (const error of errors) console.error(`error: ${error}`);
  if (errors.length > 0) process.exit(1);
  console.log(`Manifest and .env.example agree (${expected.size} keys).`);
  process.exit(0);
}

const parsed = loadEnvFile(envPath);
const env = mergeEnv(parsed.values);

if (command === 'check') {
  const result = validateEnv(env, { target, capability });
  for (const duplicate of parsed.duplicates)
    result.errors.push(`${duplicate} is declared more than once in .env`);
  for (const name of Object.keys(parsed.values)) {
    if (!Object.hasOwn(ENV_MANIFEST, name)) {
      result.errors.push(`${name} is not declared in the env manifest`);
    }
  }
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  for (const error of result.errors) console.error(`error: ${error}`);
  if (result.errors.length > 0) process.exit(1);
  const scope = target
    ? `${target}:${capability ?? 'base'}`
    : 'global inventory';
  console.log(
    `Environment check passed (${scope}; ${Object.keys(ENV_MANIFEST).length} managed keys).`,
  );
  process.exit(0);
}

if (command === 'show') {
  const definitions = Object.entries(ENV_MANIFEST).filter(
    ([, definition]) => !target || definition.targets.includes(target),
  );
  for (const [name, definition] of definitions) {
    const value = env[name];
    const display =
      value === undefined || value === ''
        ? '<unset>'
        : definition.sensitive
          ? '<redacted>'
          : value;
    console.log(`${name}=${display}`);
  }
  if (target && ['web', 'expo', 'desktop', 'landing-page'].includes(target)) {
    console.log('\nProjected names:');
    for (const [name, value] of Object.entries(
      projectEnv(env, target),
    ).sort()) {
      const canonical = Object.entries(ENV_MANIFEST).find(([, definition]) =>
        Object.values(definition.projections).includes(name),
      );
      console.log(
        `${name}=${canonical?.[1].sensitive ? '<redacted>' : value || '<unset>'}`,
      );
    }
  }
  process.exit(0);
}

console.error(
  'usage: pnpm env:<check|show|migrate> [--target name] [--capability name]',
);
process.exit(2);
