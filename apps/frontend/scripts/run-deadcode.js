#!/usr/bin/env node

/**
 * Runs Knip to detect unused files, dependencies, and orphaned exports.
 *
 * Usage:
 *   npm run deadcode           -> default mode
 *   npm run deadcode:ci        -> CI/json reporter
 *   npm run deadcode:fix       -> Knip auto-fix
 *   npm run deadcode:check     -> Knip check mode (no config hints)
 */

import { spawnSync } from 'node:child_process';

const DEFAULT_MODE_KEY = 'default';

const MODES = {
  default: {
    label: 'Local dead-code scan',
    knipArgs: ['--files', '--exports', '--dependencies'],
  },
  ci: {
    label: 'CI dead-code scan',
    knipArgs: ['--files', '--exports', '--dependencies', '--reporter=json'],
  },
  fix: {
    label: 'Knip --fix',
    knipArgs: ['--files', '--exports', '--dependencies', '--fix'],
  },
  check: {
    label: 'Knip check',
    knipArgs: ['--files', '--exports', '--dependencies', '--no-config-hints'],
  },
};

function runCommand(command, args) {
  console.log(`[deadcode] Running ${command} ${args.join(' ')}`.trim());
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(result.error);
  }

  if (typeof result.status === 'number') {
    return result.status;
  }

  return result.signal ? 1 : 0;
}

const modeKey = process.argv[2] ?? DEFAULT_MODE_KEY;
const mode = MODES[modeKey];

if (!mode) {
  console.error(
    `[deadcode] Unknown mode "${modeKey}". Supported modes: ${Object.keys(
      MODES,
    ).join(', ')}`,
  );
  process.exit(1);
}

process.exit(runCommand('knip', mode.knipArgs));
