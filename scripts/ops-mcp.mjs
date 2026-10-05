#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

// Fail fast with an actionable hint: MCP clients surface a fast exit as
// `Connection closed`, which hides the underlying missing-install/build step.
if (!existsSync(path.join(repoRoot, 'node_modules/.bin/tsx'))) {
  console.error(
    'error: zap-pilot-ops MCP cannot start: missing node_modules (tsx not found). ' +
      'Run HUSKY=0 pnpm install --frozen-lockfile --offline from the repository root, then restart your MCP client.',
  );
  process.exit(1);
}
if (!existsSync(path.join(repoRoot, 'packages/types/dist/shared/index.js'))) {
  console.error(
    'error: zap-pilot-ops MCP cannot start: missing workspace build (@zapengine/types dist not found). ' +
      "Run pnpm turbo run build --filter='./packages/*' from the repository root, then restart your MCP client.",
  );
  process.exit(1);
}
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
