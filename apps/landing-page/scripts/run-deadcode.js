#!/usr/bin/env node

/**
 * Runs Knip and ts-prune back-to-back so that we catch unused files,
 * dependencies, and orphaned exports (including those hidden behind barrel files).
 *
 * Usage:
 *   npm run deadcode           -> default mode
 *   npm run deadcode:ci        -> CI/json reporter
 *   npm run deadcode:fix       -> Knip auto-fix + ts-prune report
 *   npm run deadcode:check     -> Knip check mode + ts-prune STRICT (fails on component dead code)
 */

const { spawnSync } = require('node:child_process');

const MODES = {
  default: {
    label: 'Local dead-code scan',
    knipArgs: ['--exports', '--dependencies'],
    tsPruneArgs: [],
    strictTsPrune: false,
  },
  ci: {
    label: 'CI dead-code scan',
    knipArgs: ['--exports', '--dependencies', '--reporter=json'],
    tsPruneArgs: [],
    strictTsPrune: true,
  },
  fix: {
    label: 'Knip --fix + ts-prune',
    knipArgs: ['--exports', '--dependencies', '--fix'],
    tsPruneArgs: [],
    strictTsPrune: false,
  },
  check: {
    label: 'Knip check + ts-prune STRICT',
    knipArgs: ['--exports', '--dependencies', '--no-config-hints'],
    tsPruneArgs: [],
    strictTsPrune: true,
  },
};

// Patterns to ignore in ts-prune output (false positives)
const IGNORE_PATTERNS = [
  // Barrel files (index.ts re-exports)
  /\/index\.ts:/,
  // Next.js special exports
  /- default$/,
  /- metadata$/,
  // Test utilities
  /\/test-utils\//,
  /\/__tests__\//,
  /\.test\.(ts|tsx):/,
  // Type-only exports (commonly re-exported)
  /\.types\.ts:/,
  // App router files
  /\/app\/.*\.(ts|tsx):/,
  // Data files (intended for re-export)
  /\/data\//,
  // Hooks (commonly exported for flexibility)
  /\/hooks\//,
  // Lib utilities (commonly exported for flexibility)
  /\/lib\//,
  // Config files
  /\/config\//,
  // Types directory
  /\/types\//,
  // "(used in module)" means it's used internally, not dead
  /\(used in module\)/,
];

const modeKey = process.argv[2] ?? 'default';
const mode = MODES[modeKey];

if (!mode) {
  console.error(
    `[deadcode] Unknown mode "${modeKey}". Supported modes: ${Object.keys(MODES).join(', ')}`
  );
  process.exit(1);
}

const run = (command, args, captureOutput = false) => {
  console.log(`[deadcode] Running ${command} ${args.join(' ')}`.trim());
  const result = spawnSync(command, args, {
    stdio: captureOutput ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
    encoding: 'utf-8',
  });

  if (result.error) {
    console.error(result.error);
  }

  return {
    status: typeof result.status === 'number' ? result.status : result.signal ? 1 : 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
};

const knipResult = run('knip', mode.knipArgs);

// Run ts-prune
const tsPruneResult = run(
  'ts-prune',
  ['-p', 'tsconfig.tsprune.json', ...mode.tsPruneArgs],
  mode.strictTsPrune
);

let tsPruneStatus = 0;

if (mode.strictTsPrune && tsPruneResult.stdout) {
  // Parse ts-prune output and find real dead code in components
  const lines = tsPruneResult.stdout.split('\n').filter(line => line.trim());

  // Filter to only component files that aren't in ignore patterns
  const componentDeadCode = lines.filter(line => {
    // Must be a component file
    if (!line.includes('src/components/') || !line.includes('.tsx:')) {
      return false;
    }
    // Must not match any ignore pattern
    return !IGNORE_PATTERNS.some(pattern => pattern.test(line));
  });

  // Print all ts-prune output for visibility
  console.log(tsPruneResult.stdout);

  if (componentDeadCode.length > 0) {
    console.error('\n[deadcode] ❌ STRICT MODE: Found unused component exports:');
    componentDeadCode.forEach(line => console.error(`  ${line}`));
    console.error('\nThese component exports are not used anywhere. Either:');
    console.error('  1. Delete the unused component/export');
    console.error('  2. Use the export somewhere');
    console.error(
      '  3. Add to IGNORE_PATTERNS in scripts/run-deadcode.js if this is a false positive\n'
    );
    tsPruneStatus = 1;
  } else {
    console.log('[deadcode] ✅ No unused component exports found.');
  }
} else if (!mode.strictTsPrune) {
  // Just run for informational purposes
  run('ts-prune', ['-p', 'tsconfig.tsprune.json', ...mode.tsPruneArgs]);
}

// Fail if either Knip or strict ts-prune failed
const finalStatus = knipResult.status || tsPruneStatus;
process.exit(finalStatus);
