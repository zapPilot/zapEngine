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
const socialAgents = read('apps/podcast-pipeline/src/social/AGENTS.md');
const daemon = read('apps/podcast-pipeline/src/social/daemon.ts');
const cohort = read('apps/podcast-pipeline/src/social/cohort.ts');
const policy = read('apps/podcast-pipeline/src/social/policy.ts');
const languageAllocation = read(
  'apps/podcast-pipeline/src/social/language-allocation.ts',
);
const readme = read('apps/podcast-pipeline/src/social/README.md');
const growthView = read(
  'apps/control-center/src/client/pages/GrowthPage.tsx',
);
const recovery = read(
  'apps/podcast-pipeline/src/social/release-cohort-store.ts',
);
const languageRecoveryMigration = read(
  'supabase/migrations/20260901031500_social_language_v2_recovery_guards.sql',
);
const finalLanguageMigration = read(
  'supabase/migrations/20260914004500_finalize_social_language_policy.sql',
);
const claimMigration = read(
  'supabase/migrations/20260826120000_claim_social_publish_batch_episode_scope.sql',
);
const contractTest =
  'apps/podcast-pipeline/src/social/daemon-release-cohort-contract.test.ts';
const languageContractTest =
  'apps/podcast-pipeline/src/social/language-allocation.test.ts';
const rolloutContractTest =
  'apps/podcast-pipeline/src/social/cohort-language-rollout.test.ts';
const waitingMediaContractTest =
  'apps/podcast-pipeline/src/socialWaitingMediaPolicyMigration.test.ts';
const finalLanguageMigrationTest =
  'apps/podcast-pipeline/src/socialFinalLanguagePolicyMigration.test.ts';
const recoveryTest =
  'apps/podcast-pipeline/src/social/release-cohort-store.test.ts';

requireMatch(
  'AGENTS product invariant',
  agents,
  /NON-NEGOTIABLE PRODUCT CONTRACT:[^\n]*episode releases as one cross-platform cohort/i,
);
requireMatch(
  'scoped AGENTS readiness-before-slot invariant',
  socialAgents,
  /Readiness then slot then lanes/i,
);
requireMatch(
  'scoped AGENTS language coverage invariant',
  socialAgents,
  /Each article must cover all three languages/i,
);
requireMatch(
  'scoped AGENTS historical v2 profile invariant',
  socialAgents,
  /social-language-profile-v2/i,
);
requireMatch(
  'scoped AGENTS historical v3 profile invariant',
  socialAgents,
  /social-language-profile-v3/i,
);
requireMatch(
  'scoped AGENTS final language policy',
  socialAgents,
  /Final fixed language policy/i,
);
requireMatch(
  'daemon episode-level lane resolver',
  daemon,
  /resolveReleaseCohortLanes/,
);
requireMatch(
  'daemon pre-slot readiness resolver',
  daemon,
  /resolveRequiredReleaseLanguages/,
);
requireMatch('daemon article slot scheduling', daemon, /nextReleaseSlot/);
requireMatch(
  'daemon partial cohort fence',
  daemon,
  /listPartiallyPublishedCohorts/,
);
requireMatch(
  'daemon publish-time media re-check',
  daemon,
  /holdCohortsMissingMedia/,
);
requireMatch(
  'daemon publish-time copy barrier',
  daemon,
  /holdCohortsMissingCopy/,
);
requireMatch(
  'historical language allocation balanced profiles',
  languageAllocation,
  /profile:\s*'A'[\s\S]*profile:\s*'B'[\s\S]*profile:\s*'C'/,
);
requireMatch(
  'historical fixed-threads swap profiles',
  languageAllocation,
  /profile:\s*'D'[\s\S]*profile:\s*'E'/,
);
requireMatch(
  'historical threads fixed-chinese cutover',
  policy,
  /SOCIAL_LANGUAGE_THREADS_FIXED_SINCE/,
);
requireMatch(
  'final fixed-language cutover',
  policy,
  /SOCIAL_LANGUAGE_FINAL_FIXED_SINCE/,
);
requireMatch(
  'final fixed-language mapping',
  policy,
  /rednote:\s*'zh-Hant'[\s\S]*threads:\s*'zh-Hant'[\s\S]*x:\s*'ja'[\s\S]*youtube:\s*'en'/,
);
requireMatch(
  'final fixed cohort resolver',
  cohort,
  /isFinalLanguagePolicyActive[\s\S]*finalReleaseCohortLanes/,
);
requireMatch(
  'historical durable v3 swap profile assignment',
  cohort,
  /SOCIAL_LANGUAGE_SWAP_PROFILE_ASSIGNMENT_KEY/,
);
requireMatch(
  'historical language allocation experiment keys',
  policy,
  /x-language-v2[\s\S]*threads-language-v1[\s\S]*youtube-language-v1/,
);
requireMatch(
  'historical durable v2 profile assignment',
  cohort,
  /SOCIAL_LANGUAGE_PROFILE_ASSIGNMENT_KEY/,
);
requireMatch(
  'legacy generation marker read',
  cohort,
  /LEGACY_LANGUAGE_GENERATION_MARKER[\s\S]*getExperimentAssignment/,
);
requireMatch(
  'database generation guard',
  languageRecoveryMigration,
  /guard_social_language_v2_generation/,
);
requireMatch(
  'waiting-media pre-scheduling language readiness',
  languageRecoveryMigration,
  /cross join required_language/i,
);
requireMatch(
  'final queue language rewrite',
  finalLanguageMigration,
  /update from_fed_to_chain\.social_publish_jobs[\s\S]*when 'x' then 'ja'[\s\S]*when 'youtube' then 'en'/i,
);
requireMatch(
  'final queue experiment cleanup',
  finalLanguageMigration,
  /delete from from_fed_to_chain\.social_experiment_assignments/i,
);
requireMatch(
  'production queue reconciliation',
  recovery,
  /alignPendingSocialReleaseCohorts/,
);
requireMatch('bounded partial-cohort fence', recovery, /MAX_PUBLISH_ATTEMPTS/);
requireMatch('paged durable queue read', recovery, /\.range\(\s*offset/);
requireMatch(
  'README episode scheduling unit',
  readme,
  /`?episode_id`? is the scheduling unit/i,
);
requireMatch(
  'README final fixed language policy',
  readme,
  /X[^\n]*`ja`[\s\S]*YouTube[^\n]*`en`/i,
);
requireMatch(
  'episode-scoped claim RPC',
  claimMigration,
  /p_episode_id\s+uuid\s+default\s+null/i,
);
requireMatch(
  'claim RPC chooses one seed episode',
  claimMigration,
  /into\s+seed_episode_id[\s\S]*limit\s+1/i,
);

const policySlotsBlock =
  policy.match(/export const SOCIAL_RELEASE_SLOTS = \[([\s\S]*?)\]\s+as const/)?.[1] ??
  '';
const policyReleaseSlots = [...policySlotsBlock.matchAll(/\{\s*hour:\s*(\d+),\s*minute:\s*(\d+)\s*\}/g)].map(
  ([, hour, minute]) => `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
);
const growthSlotsBlock =
  growthView.match(/CURRENT_RELEASE_SLOTS_JST = \[([^\]]+)\]/)?.[1] ?? '';
const growthReleaseSlots = [...growthSlotsBlock.matchAll(/'(\d{2}:\d{2})'/g)].map(
  ([, slot]) => slot,
);
const dailyCap = Number(
  policy.match(/SOCIAL_RELEASE_DAILY_CAP\s*=\s*(\d+)/)?.[1] ?? Number.NaN,
);
if (JSON.stringify(policyReleaseSlots) !== JSON.stringify(growthReleaseSlots)) {
  failures.push(
    `Control Center GrowthView release slots ${JSON.stringify(growthReleaseSlots)} do not match policy ${JSON.stringify(policyReleaseSlots)}`,
  );
}
if (dailyCap !== growthReleaseSlots.length) {
  failures.push(
    `Control Center GrowthView exposes ${growthReleaseSlots.length} slots but SOCIAL_RELEASE_DAILY_CAP is ${dailyCap}`,
  );
}

forbidMatch('daemon', daemon, /enqueuePlatformCohort/);
forbidMatch('daemon', daemon, /platformBudgetIndex/);
forbidMatch('daemon', daemon, /nextBudgetSlot/);
forbidMatch('policy', policy, /PLATFORM_PUBLISH_POLICY/);
forbidMatch('README', readme, /\(episode, platform\) is the scheduling unit/i);
forbidMatch('README', readme, /different platforms[^\n]*independent releases/i);

for (const path of [
  contractTest,
  languageContractTest,
  rolloutContractTest,
  waitingMediaContractTest,
  finalLanguageMigrationTest,
  recoveryTest,
]) {
  if (!existsSync(resolve(root, path))) {
    failures.push(`${path}: required executable contract test is missing`);
  }
}

if (failures.length > 0) {
  console.error('Social release contract check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Social release contract check passed.');
