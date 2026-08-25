#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';

import { ENV_MANIFEST } from '../../config/env.manifest.mjs';
import { loadEnvFile, mergeEnv, projectAllClientEnv } from './lib.mjs';
import { resolveValues } from './sources.mjs';

const separator = process.argv.indexOf('--');
const runnerArgs = separator >= 0 ? process.argv.slice(2, separator) : [];
const rawCommand =
  separator >= 0 ? process.argv.slice(separator + 1) : process.argv.slice(2);
const localEnv =
  runnerArgs.includes('--local-env') || rawCommand.includes('--local-env');
const command = rawCommand.filter((argument) => argument !== '--local-env');
if (command.length === 0) {
  console.error('usage: node scripts/env/run.mjs -- <command> [args...]');
  process.exit(2);
}

const repoRoot = path.resolve(import.meta.dirname, '../..');
let sourceValues;
if (localEnv) {
  const parsed = loadEnvFile(path.join(repoRoot, '.env'));
  const errors = [
    ...parsed.duplicates.map((name) => `${name} is duplicated in .env`),
    ...Object.keys(parsed.values)
      .filter((name) => !Object.hasOwn(ENV_MANIFEST, name))
      .map((name) => `${name} is not declared in the env manifest`),
  ];
  if (errors.length > 0) {
    for (const error of errors) console.error(`error: ${error}`);
    process.exit(1);
  }
  sourceValues = parsed.values;
  console.warn(
    `WARNING: ${Object.keys(sourceValues).length} local overrides active (--local-env).`,
  );
} else {
  try {
    sourceValues = resolveValues('dev');
  } catch (error) {
    console.error(`error: ${error.message}`);
    console.error('Use --local-env only as an offline escape hatch.');
    process.exit(1);
  }
}
const canonical = mergeEnv(sourceValues);
const env = { ...canonical, ...projectAllClientEnv(canonical) };

const child = spawn(command[0], command.slice(1), {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
