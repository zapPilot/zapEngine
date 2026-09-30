#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { collectScopes, emptyState, validateState } from './test-qa-lib.mjs';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const result = {
    state: null,
    limit: 3,
    ref: 'HEAD',
    repoRoot: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--state') result.state = argv[++index] ?? null;
    else if (value === '--limit') result.limit = Number(argv[++index]);
    else if (value === '--ref') result.ref = argv[++index] ?? 'HEAD';
    else if (value === '--repo')
      result.repoRoot = argv[++index] ?? process.cwd();
    else throw new Error(`unknown argument: ${value}`);
  }
  if (
    !Number.isInteger(result.limit) ||
    result.limit < 1 ||
    result.limit > 100
  ) {
    throw new Error('--limit must be an integer between 1 and 100');
  }
  return result;
}

function loadState(filePath) {
  if (!filePath || !existsSync(filePath)) return emptyState();
  return validateState(JSON.parse(readFileSync(filePath, 'utf8')));
}

function ageMs(value, now) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? Number.POSITIVE_INFINITY
    : now.getTime() - parsed;
}

export function classifyScope(scope, previous, now = new Date()) {
  if (!previous) return { kind: 'never', priority: 1 };

  if (previous.status === 'pending') {
    return { kind: 'pending', priority: null };
  }

  const changed = previous.fingerprint !== scope.fingerprint;
  if (previous.status === 'rejected') {
    return changed
      ? {
          kind: 'changed',
          priority: 2,
          auditedAt: previous.auditedAt,
        }
      : { kind: 'rejected', priority: null };
  }

  const testFindings = (previous.findings ?? []).filter(
    (finding) => finding.kind === 'test',
  );
  if (testFindings.length > 0) {
    return {
      kind: 'test-finding',
      priority: 0,
      auditedAt: previous.auditedAt,
    };
  }

  if (changed) {
    return {
      kind: 'changed',
      priority: 2,
      auditedAt: previous.auditedAt,
    };
  }

  if (previous.status === 'finding') {
    return { kind: 'finding', priority: null };
  }

  if (ageMs(previous.auditedAt, now) >= THIRTY_DAYS_MS) {
    return {
      kind: 'stale',
      priority: 3,
      auditedAt: previous.auditedAt,
    };
  }

  return { kind: 'clean', priority: null };
}

function compareCandidates(a, b) {
  if (a.selection.priority !== b.selection.priority) {
    return a.selection.priority - b.selection.priority;
  }

  if (a.selection.kind === 'never' && b.selection.kind === 'never') {
    return (
      b.risk.score - a.risk.score ||
      b.files.length - a.files.length ||
      a.key.localeCompare(b.key)
    );
  }

  const left = Date.parse(a.selection.auditedAt ?? '1970-01-01T00:00:00.000Z');
  const right = Date.parse(b.selection.auditedAt ?? '1970-01-01T00:00:00.000Z');
  return left - right || a.key.localeCompare(b.key);
}

export function selectScopes({
  repoRoot,
  ref = 'HEAD',
  state = emptyState(),
  limit = 3,
  now = new Date(),
}) {
  validateState(state);
  const scopes = collectScopes(repoRoot, { ref });
  const counts = {
    total: scopes.length,
    never: 0,
    changed: 0,
    stale: 0,
    clean: 0,
    pending: 0,
    finding: 0,
    rejected: 0,
    testFinding: 0,
  };
  const candidates = [];

  for (const scope of scopes) {
    const previous = state.scopes[scope.key];
    const selection = classifyScope(scope, previous, now);
    if (selection.kind === 'test-finding') counts.testFinding += 1;
    else if (Object.hasOwn(counts, selection.kind)) counts[selection.kind] += 1;
    else if (selection.kind === 'finding') counts.finding += 1;

    if (selection.priority !== null) {
      candidates.push({
        ...scope,
        selection,
        previous: previous
          ? {
              status: previous.status,
              auditedAt: previous.auditedAt,
              auditedCommit: previous.auditedCommit,
              pr: previous.pr ?? null,
              findings: previous.findings ?? [],
            }
          : null,
      });
    }
  }

  candidates.sort(compareCandidates);
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    ref,
    stateGeneratedAt: state.generatedAt,
    summary: {
      ...counts,
      selectable: candidates.length,
      limit,
    },
    scopes: candidates.slice(0, limit),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(args.repoRoot);
  const state = loadState(args.state ? resolve(args.state) : null);
  const result = selectScopes({
    repoRoot,
    ref: args.ref,
    state,
    limit: args.limit,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
