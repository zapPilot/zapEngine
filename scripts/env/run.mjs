#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';

import { loadEnvFile, mergeEnv, projectAllClientEnv } from './lib.mjs';

const separator = process.argv.indexOf('--');
const command = separator >= 0 ? process.argv.slice(separator + 1) : process.argv.slice(2);
if (command.length === 0) {
  console.error('usage: node scripts/env/run.mjs -- <command> [args...]');
  process.exit(2);
}

const repoRoot = path.resolve(import.meta.dirname, '../..');
const { values } = loadEnvFile(path.join(repoRoot, '.env'));
const canonical = mergeEnv(values);
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
