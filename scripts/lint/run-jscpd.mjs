#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cwd = process.cwd();

const LOCAL_ONLY_KEYS = new Set(['$schema', 'format', 'ignore', 'ignorePattern']);
const FLAG_BY_ROOT_KEY = new Map([
  ['threshold', '--threshold'],
  ['exitCode', '--exitCode'],
  ['minTokens', '--min-tokens'],
  ['minLines', '--min-lines'],
  ['mode', '--mode'],
  ['output', '--output'],
]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readLocalConfig() {
  const configPath = path.join(cwd, '.jscpd.json');
  if (!existsSync(configPath)) {
    return {};
  }

  const config = readJson(configPath);
  const disallowed = Object.keys(config).filter((key) => !LOCAL_ONLY_KEYS.has(key));
  if (disallowed.length > 0) {
    console.error(
      `[run-jscpd] Local .jscpd.json may only define ${[...LOCAL_ONLY_KEYS].join(
        ', ',
      )}. Found: ${disallowed.join(', ')}`,
    );
    process.exit(1);
  }
  return config;
}

function appendArrayFlag(args, flag, values) {
  if (Array.isArray(values) && values.length > 0) {
    args.push(flag, values.join(','));
  }
}

function readReportTotal() {
  const reportPath = path.join(
    cwd,
    String(rootConfig.output ?? '.jscpd'),
    'jscpd-report.json',
  );
  if (!existsSync(reportPath)) {
    return null;
  }
  const report = readJson(reportPath);
  return report?.statistics?.total ?? null;
}

function isWithinThreshold() {
  const threshold = Number(rootConfig.threshold);
  if (!Number.isFinite(threshold)) {
    return false;
  }
  const total = readReportTotal();
  if (total === null) {
    return false;
  }
  const duplicatedLines = Number(total.percentage);
  const duplicatedTokens = Number(total.percentageTokens);
  return (
    Number.isFinite(duplicatedLines) &&
    Number.isFinite(duplicatedTokens) &&
    duplicatedLines <= threshold &&
    duplicatedTokens <= threshold
  );
}

const rootConfig = readJson(path.join(repoRoot, '.jscpd.json'));
const localConfig = readLocalConfig();
const scanPaths = process.argv.slice(2);

const args = scanPaths.length > 0 ? [...scanPaths] : ['src'];

for (const [key, flag] of FLAG_BY_ROOT_KEY) {
  if (rootConfig[key] !== undefined) {
    args.push(flag, String(rootConfig[key]));
  }
}

if (rootConfig.gitignore) {
  args.push('--gitignore');
}

appendArrayFlag(args, '--reporters', rootConfig.reporters);
appendArrayFlag(args, '--format', localConfig.format);
appendArrayFlag(args, '--ignore', localConfig.ignore);
appendArrayFlag(args, '--ignore-pattern', localConfig.ignorePattern);

const jscpdEntry = require.resolve('jscpd');
const jscpdRoot = path.resolve(path.dirname(jscpdEntry), '..');
const jscpdBin = path.join(jscpdRoot, 'bin', 'jscpd');

const result = spawnSync(process.execPath, [jscpdBin, ...args], {
  cwd,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (typeof result.status === 'number') {
  if (result.status !== 0 && isWithinThreshold()) {
    process.exit(0);
  }
  process.exit(result.status);
}

if (result.signal) {
  process.exit(1);
}
