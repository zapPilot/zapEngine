#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const failures = [];
const requireMatch = (label, text, pattern) => {
  if (!pattern.test(text)) failures.push(`${label}: missing ${pattern}`);
};
const forbidMatch = (label, text, pattern) => {
  if (pattern.test(text)) failures.push(`${label}: forbidden ${pattern}`);
};

const agents = read('apps/podcast-pipeline/AGENTS.md');
const daemon = read('apps/podcast-pipeline/src/social/daemon.ts');
const policy = read('apps/podcast-pipeline/src/social/policy.ts');
const readme = read('apps/podcast-pipeline/src/social/README.md');
const recovery = read(
  'apps/podcast-pipeline/src/social/release-cohort-store.ts',
);
const contractTest =
  'apps/podcast-pipeline/src/social/daemon-release-cohort-contract.test.ts';

requireMatch(
  'AGENTS product invariant',
  agents,
  /NON-NEGOTIABLE PRODUCT CONTRACT:[^\n]*episode releases as one cross-platform cohort/i,
);
requireMatch(
  'daemon episode-level lane resolver',
  daemon,
  /resolveReleaseCohortLanes/,
);
requireMatch(
  'daemon article slot scheduling',
  daemon,
  /nextReleaseSlot/,
);
requireMatch(
  'daemon partial cohort fence',
  daemon,
  /listPartiallyPublishedCohorts/,
);
requireMatch(
  'production queue reconciliation',
  recovery,
  /alignPendingSocialReleaseCohorts/,
);
requireMatch(
  'README episode scheduling unit',
  readme,
  /episode_id is the scheduling unit/i,
);

forbidMatch('daemon', daemon, /enqueuePlatformCohort/);
forbidMatch('daemon', daemon, /platformBudgetIndex/);
forbidMatch('daemon', daemon, /nextBudgetSlot/);
forbidMatch('policy', policy, /PLATFORM_PUBLISH_POLICY/);
forbidMatch('README', readme, /\(episode, platform\) is the scheduling unit/i);
forbidMatch(
  'README',
  readme,
  /different platforms[^\n]*independent releases/i,
);

if (!existsSync(resolve(root, contractTest))) {
  failures.push(`${contractTest}: required executable contract test is missing`);
}

if (failures.length > 0) {
  console.error('Social release contract check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Social release contract check passed.');
