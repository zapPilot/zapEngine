#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  collectScopes,
  emptyState,
  fingerprintPaths,
  listFilesAtRef,
  findingId,
  MAX_RECORD_PAYLOAD_BYTES,
  MAX_TEXT_LENGTH,
  safePath,
  STATE_SCHEMA_VERSION,
  validateState,
} from './test-qa-lib.mjs';

const RECORD_FIELDS = [
  'schemaVersion',
  'workerRunId',
  'at',
  'outcome',
  'scope',
];
const SCOPE_FIELDS = [
  'key',
  'status',
  'auditedAt',
  'auditedCommit',
  'fingerprint',
  'files',
  'relatedPaths',
  'pr',
  'findings',
];
const FINDING_FIELDS = ['id', 'kind', 'summary', 'issue'];

function assertKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknown.join(', ')}`);
  }
}

function assertIso(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO date string`);
  }
}

function validateFinding(finding, label) {
  assertKeys(finding, FINDING_FIELDS, label);
  if (
    typeof finding.id !== 'string' ||
    finding.id.length === 0 ||
    finding.id.length > 128
  ) {
    throw new Error(`${label}.id is invalid`);
  }
  if (!['test', 'production', 'bug'].includes(finding.kind)) {
    throw new Error(`${label}.kind is invalid`);
  }
  if (
    typeof finding.summary !== 'string' ||
    finding.summary.length === 0 ||
    finding.summary.length > MAX_TEXT_LENGTH
  ) {
    throw new Error(`${label}.summary is invalid`);
  }
  if (
    finding.issue !== undefined &&
    finding.issue !== null &&
    (!Number.isInteger(finding.issue) || finding.issue <= 0)
  ) {
    throw new Error(`${label}.issue is invalid`);
  }
}

export function validateRecord(record) {
  assertKeys(record, RECORD_FIELDS, 'record');
  if (record.schemaVersion !== STATE_SCHEMA_VERSION) {
    throw new Error('record.schemaVersion is invalid');
  }
  if (
    typeof record.workerRunId !== 'string' ||
    record.workerRunId.length === 0 ||
    record.workerRunId.length > 128
  ) {
    throw new Error('record.workerRunId is invalid');
  }
  assertIso(record.at, 'record.at');
  if (
    typeof record.outcome !== 'string' ||
    record.outcome.length === 0 ||
    record.outcome.length > 128
  ) {
    throw new Error('record.outcome is invalid');
  }
  if (record.scope === null) return record;

  assertKeys(record.scope, SCOPE_FIELDS, 'record.scope');
  if (!safePath(record.scope.key))
    throw new Error('record.scope.key is invalid');
  if (
    !['clean', 'pending', 'finding', 'rejected'].includes(record.scope.status)
  ) {
    throw new Error('record.scope.status is invalid');
  }
  assertIso(record.scope.auditedAt, 'record.scope.auditedAt');
  if (
    typeof record.scope.auditedCommit !== 'string' ||
    record.scope.auditedCommit.length === 0 ||
    record.scope.auditedCommit.length > 128
  ) {
    throw new Error('record.scope.auditedCommit is invalid');
  }
  if (!/^[a-f0-9]{64}$/u.test(record.scope.fingerprint ?? '')) {
    throw new Error('record.scope.fingerprint is invalid');
  }
  for (const field of ['files', 'relatedPaths']) {
    if (
      !Array.isArray(record.scope[field]) ||
      !record.scope[field].every(safePath)
    ) {
      throw new Error(`record.scope.${field} is invalid`);
    }
  }
  if (
    record.scope.pr !== undefined &&
    record.scope.pr !== null &&
    (!Number.isInteger(record.scope.pr) || record.scope.pr <= 0)
  ) {
    throw new Error('record.scope.pr is invalid');
  }
  if (
    record.scope.status === 'pending' &&
    (!Number.isInteger(record.scope.pr) || record.scope.pr <= 0)
  ) {
    throw new Error('pending records require --pr');
  }
  if (!Array.isArray(record.scope.findings)) {
    throw new Error('record.scope.findings must be an array');
  }
  record.scope.findings.forEach((finding, index) =>
    validateFinding(finding, `record.scope.findings[${index}]`),
  );
  return record;
}

function parseRecordArgs(argv) {
  const options = {
    key: null,
    status: null,
    ref: 'HEAD',
    pr: null,
    findings: [],
    issue: null,
    workerRunId: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
    outcome: 'audit',
    at: new Date().toISOString(),
    repoRoot: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const result = argv[++index];
      if (result === undefined) throw new Error(`missing value for ${arg}`);
      return result;
    };
    if (arg === '--key') options.key = value();
    else if (arg === '--status') options.status = value();
    else if (arg === '--ref') options.ref = value();
    else if (arg === '--pr') options.pr = Number(value());
    else if (arg === '--finding') options.findings.push(value());
    else if (arg === '--issue') options.issue = Number(value());
    else if (arg === '--worker-run-id') options.workerRunId = value();
    else if (arg === '--outcome') options.outcome = value();
    else if (arg === '--at') options.at = value();
    else if (arg === '--repo') options.repoRoot = value();
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function parseFinding(value, issue) {
  const colon = value.indexOf(':');
  if (colon <= 0) {
    throw new Error('--finding must use kind:summary');
  }
  const kind = value.slice(0, colon);
  const summary = value.slice(colon + 1).trim();
  if (!['test', 'production', 'bug'].includes(kind)) {
    throw new Error(`invalid finding kind: ${kind}`);
  }
  if (!summary || summary.length > MAX_TEXT_LENGTH) {
    throw new Error('finding summary is empty or too long');
  }
  return {
    id: findingId(kind, summary),
    kind,
    summary,
    ...(kind === 'bug' && Number.isInteger(issue) && issue > 0
      ? { issue }
      : {}),
  };
}

function gitSha(repoRoot, ref) {
  return execFileSync('git', ['rev-parse', ref], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

export function createRecord(options) {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const at = options.at ?? new Date().toISOString();
  assertIso(at, '--at');
  const base = {
    schemaVersion: STATE_SCHEMA_VERSION,
    workerRunId: options.workerRunId,
    at,
    outcome: options.outcome ?? 'audit',
    scope: null,
  };

  if (!options.key) {
    if (
      options.status ||
      (options.findings && options.findings.length > 0) ||
      options.pr
    ) {
      throw new Error('--status/--finding/--pr require --key');
    }
    return validateRecord(base);
  }
  if (!safePath(options.key)) throw new Error('unsafe --key');
  if (!options.status) throw new Error('--status is required with --key');

  const scopes = collectScopes(repoRoot, { ref: options.ref ?? 'HEAD' });
  const scope = scopes.find((candidate) => candidate.key === options.key);
  if (!scope)
    throw new Error(`scope not found at ${options.ref}: ${options.key}`);

  const findings = (options.findings ?? []).map((finding) =>
    typeof finding === 'string'
      ? parseFinding(finding, options.issue)
      : finding,
  );
  let status = options.status;
  if (findings.length > 0 && status === 'clean') status = 'finding';

  return validateRecord({
    ...base,
    scope: {
      key: scope.key,
      status,
      auditedAt: at,
      auditedCommit: gitSha(repoRoot, options.ref ?? 'HEAD'),
      fingerprint: scope.fingerprint,
      files: scope.files,
      relatedPaths: scope.relatedPaths,
      ...(Number.isInteger(options.pr) && options.pr > 0
        ? { pr: options.pr }
        : {}),
      findings,
    },
  });
}

function parseMergeArgs(argv) {
  const options = {
    previous: null,
    output: process.cwd(),
    repo: 'zapPilot/zapEngine',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[++index];
    if (value === undefined) throw new Error(`missing value for ${arg}`);
    if (arg === '--previous') options.previous = value;
    else if (arg === '--output') options.output = value;
    else if (arg === '--repo') options.repo = value;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function loadPrevious(filePath) {
  if (!filePath || !existsSync(filePath)) return emptyState();
  return validateState(JSON.parse(readFileSync(filePath, 'utf8')));
}

export function parseRecords(raw) {
  if (!raw) throw new Error('RECORDS is required');
  if (Buffer.byteLength(raw, 'utf8') > MAX_RECORD_PAYLOAD_BYTES) {
    throw new Error(`RECORDS exceeds ${MAX_RECORD_PAYLOAD_BYTES} bytes`);
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('RECORDS must be a JSON array');
  return parsed.map(validateRecord);
}

function readPr(repo, number) {
  return JSON.parse(
    execFileSync(
      'gh',
      [
        'pr',
        'view',
        String(number),
        '--repo',
        repo,
        '--json',
        'number,state,mergedAt,headRefOid,mergeCommit',
      ],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    ),
  );
}

export function reconcilePendingScopes(state, prReader, mainScopeReader) {
  const cache = new Map();
  for (const [key, scope] of Object.entries(state.scopes)) {
    if (scope.status !== 'pending' || !scope.pr) continue;
    if (!cache.has(scope.pr)) cache.set(scope.pr, prReader(scope.pr));
    const pr = cache.get(scope.pr);
    if (pr.state === 'MERGED' || pr.mergedAt) {
      scope.status = 'clean';
      scope.auditedCommit =
        pr.mergeCommit?.oid ?? pr.headRefOid ?? scope.auditedCommit;
    } else if (pr.state === 'CLOSED') {
      // Rejection must be compared with main, not the unmerged PR contents.
      const baseline = mainScopeReader(key, scope);
      if (!baseline) {
        delete state.scopes[key];
        continue;
      }
      scope.fingerprint = baseline.fingerprint;
      scope.files = baseline.files;
      scope.relatedPaths = baseline.relatedPaths;
      scope.auditedCommit = baseline.auditedCommit;
      scope.status = 'rejected';
    }
  }
  return state;
}

function newestScope(left, right) {
  return Date.parse(right.auditedAt) > Date.parse(left.auditedAt)
    ? right
    : left;
}

export function mergeState({
  previous,
  records,
  github,
  prReader = () => ({ state: 'OPEN' }),
  mainScopeReader = () => {
    throw new Error('main scope reader required for rejected PRs');
  },
  now = new Date(),
}) {
  const state = structuredClone(validateState(previous));
  const runMap = new Map(state.runs.map((run) => [run.workerRunId, run]));

  for (const record of records.map(validateRecord)) {
    if (record.scope) {
      const { key, ...scopeState } = record.scope;
      const current = state.scopes[key];
      state.scopes[key] = current
        ? newestScope(current, scopeState)
        : structuredClone(scopeState);
    }

    const existing = runMap.get(record.workerRunId);
    if (!existing) {
      const run = {
        workerRunId: record.workerRunId,
        at: record.at,
        outcome: record.outcome,
        scopes: record.scope ? [record.scope.key] : [],
      };
      state.runs.push(run);
      runMap.set(record.workerRunId, run);
    } else {
      if (Date.parse(record.at) >= Date.parse(existing.at)) {
        existing.at = record.at;
        existing.outcome = record.outcome;
      }
      if (record.scope && !existing.scopes.includes(record.scope.key)) {
        existing.scopes.push(record.scope.key);
        existing.scopes.sort();
      }
    }
  }

  reconcilePendingScopes(state, prReader, mainScopeReader);
  state.runs = state.runs
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 100);
  state.generatedAt = now.toISOString();
  state.github = {
    runId: github.runId,
    runAttempt: github.runAttempt,
    sha: github.sha,
  };
  return validateState(state);
}

export function renderStateMarkdown(state) {
  const counts = { clean: 0, pending: 0, finding: 0, rejected: 0 };
  for (const scope of Object.values(state.scopes)) counts[scope.status] += 1;
  const lines = [
    '# Test-QA state',
    '',
    `Generated: ${state.generatedAt}`,
    `Main SHA: ${state.github.sha || 'unknown'}`,
    '',
    '## Scope status',
    '',
    '| Status | Count |',
    '| --- | ---: |',
    `| clean | ${counts.clean} |`,
    `| pending | ${counts.pending} |`,
    `| finding | ${counts.finding} |`,
    `| rejected | ${counts.rejected} |`,
    '',
    '## Recent runs',
    '',
    '| Worker run | At | Outcome | Scopes |',
    '| --- | --- | --- | ---: |',
  ];
  for (const run of state.runs.slice(0, 20)) {
    lines.push(
      `| ${run.workerRunId.replaceAll('|', '\\|')} | ${run.at} | ${run.outcome.replaceAll('|', '\\|')} | ${run.scopes.length} |`,
    );
  }
  if (state.runs.length === 0) lines.push('| — | — | — | 0 |');
  lines.push('');
  return lines.join('\n');
}

function recordMain(argv) {
  const options = parseRecordArgs(argv);
  const record = createRecord(options);
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
}

function mergeMain(argv) {
  const options = parseMergeArgs(argv);
  const previous = loadPrevious(
    options.previous ? resolve(options.previous) : null,
  );
  const records = parseRecords(process.env.RECORDS);
  const github = {
    runId: Number(process.env.GITHUB_RUN_ID ?? 0),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
    sha: process.env.GITHUB_SHA ?? '',
  };
  if (!Number.isInteger(github.runId) || github.runId < 0) {
    throw new Error('GITHUB_RUN_ID is invalid');
  }
  if (!Number.isInteger(github.runAttempt) || github.runAttempt < 1) {
    throw new Error('GITHUB_RUN_ATTEMPT is invalid');
  }

  let mainScopes;
  let mainFiles;
  const mainSha = gitSha(process.cwd(), 'HEAD');
  const state = mergeState({
    mainScopeReader: (key, previousScope) => {
      mainScopes ??= new Map(
        collectScopes(process.cwd(), { ref: mainSha }).map((scope) => [
          scope.key,
          { ...scope, auditedCommit: mainSha },
        ]),
      );
      const scope = mainScopes.get(key);
      if (scope) return scope;
      mainFiles ??= new Set(listFilesAtRef(process.cwd(), mainSha));
      const files = previousScope.files.filter((path) => mainFiles.has(path));
      const relatedPaths = previousScope.relatedPaths.filter((path) =>
        mainFiles.has(path),
      );
      return {
        files,
        relatedPaths,
        auditedCommit: mainSha,
        fingerprint: fingerprintPaths(process.cwd(), mainSha, [
          ...files,
          ...relatedPaths,
        ]),
      };
    },
    previous,
    records,
    github,
    prReader: (number) => readPr(options.repo, number),
  });
  const output = resolve(options.output);
  mkdirSync(output, { recursive: true });
  writeFileSync(
    resolve(output, 'state.json'),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    resolve(output, 'STATE.md'),
    renderStateMarkdown(state),
    'utf8',
  );
  console.log(
    `test-qa state: ${Object.keys(state.scopes).length} scopes, ${state.runs.length} runs`,
  );
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === 'record') recordMain(argv);
  else if (command === 'merge') mergeMain(argv);
  else {
    throw new Error('usage: test-qa-state.mjs <record|merge> [options]');
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
