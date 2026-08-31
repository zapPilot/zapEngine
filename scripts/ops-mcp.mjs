#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const child = spawn(
  process.execPath,
  [
    path.join(repoRoot, 'scripts/env/run.mjs'),
    '--environment',
    'prod',
    '--',
    'pnpm',
    'exec',
    'tsx',
    'apps/control-center/src/server/mcp/stdio.ts',
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  },
);

child.on('error', (error) => {
  console.error(`error: failed to start Ops MCP: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
