#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProduct } from './sales-registry.mjs';
export function publishSteps(argv) {
  const args = argv.filter((arg) => arg !== '--');
  const [name, ...flags] = args;
  if (flags.some((flag) => flag !== '--dry-run'))
    throw new Error('usage: pnpm sales:publish <product> [--dry-run]');
  const product = getProduct(name);
  if (!product.publish)
    throw new Error(`${product.label} has no media host or manifest yet`);
  const command = [
    'pnpm',
    '--filter',
    product.publish.filter,
    product.publish.script,
    '--video-out-dir',
    path.resolve(import.meta.dirname, '..', product.publish.videoOutDir),
    ...flags,
  ];
  const wrapped = flags.includes('--dry-run')
    ? command
    : [...product.publish.secrets, ...command];
  return [
    {
      cmd: 'pnpm',
      args: ['turbo', 'run', 'build', '--filter=@zapengine/kokode-ai^...'],
    },
    { cmd: wrapped[0], args: wrapped.slice(1) },
  ];
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    for (const step of publishSteps(process.argv.slice(2))) {
      const result = spawnSync(step.cmd, step.args, {
        cwd: path.resolve(import.meta.dirname, '..'),
        stdio: 'inherit',
      });
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
