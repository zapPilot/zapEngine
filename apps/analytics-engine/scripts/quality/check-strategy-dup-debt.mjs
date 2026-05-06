#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STRATEGY_PREFIX = 'src/services/backtesting/strategies/';
const STRATEGY_QUARANTINE_GLOB = `${STRATEGY_PREFIX}**`;
const BASELINE_CLONES = 24;
const BASELINE_DUPLICATED_LINES = 243;
const EXPIRY_DATE = '2026-06-05';
const DATE_ENV_VAR = 'ZAPENGINE_DUP_DEBT_DATE';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const rootRequire = createRequire(path.join(repoRoot, 'package.json'));

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function appendArrayFlag(args, flag, values) {
  if (Array.isArray(values) && values.length > 0) {
    args.push(flag, values.join(','));
  }
}

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isStrategyFile(filePath) {
  return normalizePath(filePath).startsWith(STRATEGY_PREFIX);
}

function isStrategyQuarantineIgnore(value) {
  return normalizePath(value) === STRATEGY_QUARANTINE_GLOB;
}

function todayIsoDate() {
  const configuredDate = process.env[DATE_ENV_VAR];
  if (configuredDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(configuredDate)) {
      console.error(
        `[strategy-dup-debt] ${DATE_ENV_VAR} must use YYYY-MM-DD format.`,
      );
      process.exit(1);
    }
    return configuredDate;
  }

  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function runJscpd() {
  const rootConfig = readJson(path.join(repoRoot, '.jscpd.json'));
  const localConfig = readJson(path.join(appRoot, '.jscpd.json'));
  const debtReportOutput = path.join(
    String(rootConfig.output ?? '.jscpd'),
    'strategy-debt',
  );

  const args = ['src'];
  const flagByRootKey = new Map([
    ['minTokens', '--min-tokens'],
    ['minLines', '--min-lines'],
    ['mode', '--mode'],
  ]);

  for (const [key, flag] of flagByRootKey) {
    if (rootConfig[key] !== undefined) {
      args.push(flag, String(rootConfig[key]));
    }
  }

  if (rootConfig.gitignore) {
    args.push('--gitignore');
  }

  args.push('--exitCode', '0');
  args.push('--reporters', 'json');
  args.push('--output', debtReportOutput);

  appendArrayFlag(args, '--format', localConfig.format);
  appendArrayFlag(
    args,
    '--ignore',
    localConfig.ignore?.filter((value) => !isStrategyQuarantineIgnore(value)),
  );
  appendArrayFlag(args, '--ignore-pattern', localConfig.ignorePattern);

  const jscpdEntry = rootRequire.resolve('jscpd');
  const jscpdRoot = path.resolve(path.dirname(jscpdEntry), '..');
  const jscpdBin = path.join(jscpdRoot, 'bin', 'jscpd');
  const result = spawnSync(process.execPath, [jscpdBin, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  const reportPath = path.join(appRoot, debtReportOutput, 'jscpd-report.json');
  if (!existsSync(reportPath)) {
    console.error(
      `[strategy-dup-debt] jscpd report was not created at ${reportPath}`,
    );
    process.exit(1);
  }

  return readJson(reportPath);
}

function strategyDebtFromReport(report) {
  const duplicates = Array.isArray(report.duplicates) ? report.duplicates : [];
  const strategyDuplicates = duplicates.filter((duplicate) =>
    [duplicate.firstFile?.name, duplicate.secondFile?.name]
      .filter(Boolean)
      .some(isStrategyFile),
  );

  return {
    clones: strategyDuplicates.length,
    duplicatedLines: strategyDuplicates.reduce(
      (total, duplicate) => total + Number(duplicate.lines ?? 0),
      0,
    ),
  };
}

const report = runJscpd();
const debt = strategyDebtFromReport(report);
const checkDate = todayIsoDate();
const isExpired = checkDate >= EXPIRY_DATE;

console.log(
  `[strategy-dup-debt] ${debt.clones} strategy clones, ${debt.duplicatedLines} duplicated lines ` +
    `(baseline ${BASELINE_CLONES} clones, ${BASELINE_DUPLICATED_LINES} lines; expiry ${EXPIRY_DATE}; date ${checkDate})`,
);

if (isExpired && debt.clones > 0) {
  console.error(
    `[strategy-dup-debt] Strategy duplicate quarantine expired on ${EXPIRY_DATE}; remove strategy duplicates before this gate can pass.`,
  );
  process.exit(1);
}

if (
  !isExpired &&
  (debt.clones > BASELINE_CLONES ||
    debt.duplicatedLines > BASELINE_DUPLICATED_LINES)
) {
  console.error(
    '[strategy-dup-debt] Strategy duplicate debt grew beyond the temporary baseline.',
  );
  process.exit(1);
}

console.log(
  '[strategy-dup-debt] Strategy duplicate debt is within the temporary policy.',
);
