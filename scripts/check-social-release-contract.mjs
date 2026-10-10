#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
const readme = read('apps/podcast-pipeline/src/social/README.md');
const growthView = read('apps/control-center/src/client/pages/GrowthPage.tsx');
const recovery = read(
  'apps/podcast-pipeline/src/social/release-cohort-store.ts',
);
const languageRecoveryMigration = read(
  'supabase/migrations/20260901031500_social_language_v2_recovery_guards.sql',
);
const claimMigration = read(
  'supabase/migrations/20260826120000_claim_social_publish_batch_episode_scope.sql',
);
const brandCta = read('apps/podcast-pipeline/src/brand/cta.ts');
const platforms = read('apps/podcast-pipeline/src/social/platforms.ts');
requireMatch(
  'canonical brand slogan import',
  brandCta,
  /import\s*\{[^}]*SLOGAN[^}]*\}\s*from\s*['"]@zapengine\/zap-pilot-story\/brand['"]/,
);
forbidMatch(
  'no per-platform slogan table',
  brandCta,
  /(?:SLOGAN|BRAND_CTA)_BY_(?:PLATFORM|LANGUAGE)/,
);
forbidMatch(
  'no hard-coded slogan in the brand CTA',
  brandCta,
  /your\s+strategy\W+your\s+machine/i,
);
requireMatch(
  'Rednote excludes brand sign-off',
  platforms,
  /rednote:\s*\{[^}]*ctaMode:\s*'none'/s,
);
requireMatch(
  'brand packaging contract',
  socialAgents,
  /Brand sign-off is universal packaging/,
);
const contractTest =
  'apps/podcast-pipeline/src/social/daemon-release-cohort-contract.test.ts';
const languageContractTest = 'apps/podcast-pipeline/src/social/cohort.test.ts';
const waitingMediaContractTest =
  'apps/podcast-pipeline/src/socialWaitingMediaPolicyMigration.test.ts';
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
  'scoped AGENTS fixed language policy',
  socialAgents,
  /Fixed language policy/i,
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
// The enqueue barrier only proves media existed when the cohort was queued. A
// re-plan afterwards can delete a completed render underneath a claimed cohort,
// so transport is gated on a second readiness read as well.
requireMatch(
  'daemon publish-time media re-check',
  daemon,
  /holdCohortsMissingMedia/,
);
// Copy is the last pre-transport step that can fail for one language. Inside
// the publish loop it shipped an article's other languages before the Rednote
// red-line verdict was known, so it has to run as a barrier ahead of the first
// transport call.
requireMatch(
  'daemon publish-time copy barrier',
  daemon,
  /holdCohortsMissingCopy/,
);
requireMatch(
  'fixed language mapping',
  policy,
  /SOCIAL_LANGUAGE_BY_PLATFORM = \{\s*rednote:\s*'zh-Hant',\s*threads:\s*'zh-Hant',\s*x:\s*'ja',\s*youtube:\s*'en',/,
);
// Language is a constant now. A cohort resolver that reads a durable
// assignment, or a lane carrying experiment metadata, means the concluded
// experiment has been reintroduced rather than a new one deliberately designed.
forbidMatch(
  'cohort assigns no language experiment',
  cohort,
  /ExperimentAssignment|experimentKey|experimentVariant/,
);
requireMatch(
  'cohort derives lanes from the fixed mapping',
  cohort,
  /SOCIAL_LANGUAGE_BY_PLATFORM/,
);
requireMatch(
  'pre-multilingual back catalogue stays unpublishable',
  cohort,
  /SOCIAL_RELEASE_MIN_EPISODE_CREATED_AT/,
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
  'production queue reconciliation',
  recovery,
  /alignPendingSocialReleaseCohorts/,
);
// The partial-cohort fence stops every other article while it holds. Mirroring
// the claim RPC's attempt fence is what keeps that hold bounded instead of
// permanent, so it is guarded here and not only by the unit tests.
requireMatch('bounded partial-cohort fence', recovery, /MAX_PUBLISH_ATTEMPTS/);
requireMatch('paged durable queue read', recovery, /\.range\(\s*offset/);
requireMatch(
  'README episode scheduling unit',
  readme,
  /`?episode_id`? is the scheduling unit/i,
);
requireMatch(
  'README fixed language policy',
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

const policyCadenceBlock =
  policy.match(
    /export const SOCIAL_RELEASE_CADENCES = \[([\s\S]*?)\]\s+as const/,
  )?.[1] ?? '';
const growthCadenceBlock =
  growthView.match(
    /CURRENT_RELEASE_CADENCES_JST = \[([\s\S]*?)\]\s+as const/,
  )?.[1] ?? '';
const cadencePattern =
  /\{\s*minBacklogArticles:\s*(\d+),\s*slots:\s*\[([\s\S]*?)\]\s*,?\s*\}/g;
const parsePolicyCadences = (block) =>
  [...block.matchAll(cadencePattern)].map(
    ([, minBacklogArticles, slotsBlock]) => ({
      minBacklogArticles: Number(minBacklogArticles),
      slots: [
        ...slotsBlock.matchAll(/\{\s*hour:\s*(\d+),\s*minute:\s*(\d+)\s*\}/g),
      ].map(
        ([, hour, minute]) =>
          `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
      ),
    }),
  );
const parseGrowthCadences = (block) =>
  [...block.matchAll(cadencePattern)].map(
    ([, minBacklogArticles, slotsBlock]) => ({
      minBacklogArticles: Number(minBacklogArticles),
      slots: [...slotsBlock.matchAll(/'(\d{2}:\d{2})'/g)].map(
        ([, slot]) => slot,
      ),
    }),
  );
const policyCadences = parsePolicyCadences(policyCadenceBlock);
const growthCadences = parseGrowthCadences(growthCadenceBlock);
if (JSON.stringify(policyCadences) !== JSON.stringify(growthCadences)) {
  failures.push(
    `Control Center GrowthView release cadences ${JSON.stringify(growthCadences)} do not match policy ${JSON.stringify(policyCadences)}`,
  );
}
if (policyCadences.length !== 3) {
  failures.push(
    `Expected 3 backlog-aware release cadences, found ${policyCadences.length}`,
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
  waitingMediaContractTest,
  recoveryTest,
]) {
  if (!existsSync(resolve(root, path))) {
    failures.push(`${path}: required executable contract test is missing`);
  }
}

// Social optimization contract: global packaging only.
requireMatch(
  'social optimization contract',
  socialAgents,
  /NON-NEGOTIABLE PRODUCT CONTRACT: one universal packaging strategy/,
);
requireMatch(
  'same thesis copy',
  read('apps/podcast-pipeline/src/social/copy.ts'),
  /same underlying episode thesis/,
);
requireMatch(
  'growth packaging read model',
  read('apps/control-center/src/server/services/operations/growth.ts'),
  /readContentPackagingEvidence/,
);
for (const file of ['copy.ts', 'publish-batch.ts']) {
  forbidMatch(
    file,
    read(`apps/podcast-pipeline/src/social/${file}`),
    /Performance guidance|strategyGuidance/,
  );
}
forbidMatch(
  'daemon optimization',
  daemon,
  /refreshSocialStrategies|buildStrategyGuidance|strategyVersionId/,
);
forbidMatch(
  'Growth recommendations',
  growthView,
  /內容題材參考|最佳題材|bestTopic|publishSlotsJst|preferredHookTypes/,
);
for (const file of ['server/services/social.ts', 'shared/types.ts']) {
  forbidMatch(
    file,
    read(`apps/control-center/src/${file}`),
    /SocialDecision|bestTopic|LiftVsPlatformMedian|social_strategy_versions/,
  );
}
forbidMatch(
  'statement recommendations',
  read('apps/control-center/src/server/services/statements/rules.ts'),
  /publish the next one/,
);
for (const file of [
  'DistributionChain.tsx',
  'DistributionChannels.tsx',
  'DistributionReliability.tsx',
]) {
  forbidMatch(
    file,
    read(`apps/landing-page/src/components/distribution/${file}`),
    /publishing strategy|strategyVersions/,
  );
}

// Titles are frozen during ingest, never generated in social.
function checkSocialTitleImports(directory) {
  for (const entry of readdirSync(resolve(root, directory), {
    withFileTypes: true,
  })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) checkSocialTitleImports(path);
    else if (/\.[cm]?tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      forbidMatch(
        path,
        read(path),
        /generateEditorialTitle|compressEditorialTitle|editorial-title|title-repair-cli|title-[\w-]*system-prompt/,
      );
    }
  }
}
checkSocialTitleImports('apps/podcast-pipeline/src/social');

// Titles are never cut to fit a platform: an over-budget title is held, not
// truncated. The deleted helpers must not come back under any directory.
function checkNoTitleTruncation(directory) {
  for (const entry of readdirSync(resolve(root, directory), {
    withFileTypes: true,
  })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) checkNoTitleTruncation(path);
    else if (/\.[cm]?tsx?$/.test(entry.name)) {
      forbidMatch(
        path,
        read(path),
        /fitTitleToBudget|fitRednoteTitle|fitTransportTitle/,
      );
    }
  }
}
checkNoTitleTruncation('apps/podcast-pipeline/src');
forbidMatch(
  'compression prompt platform names',
  read('apps/podcast-pipeline/prompts/title-compression-system-prompt.txt'),
  /rednote|youtube|threads|小红书|小紅書|twitter|\bx\b|\bplatform\b/iu,
);
for (const anchor of [
  /Best Title and editorial source of truth/,
  /generated in ingest by character/,
  /never recomputed/,
  /Social never generates titles/,
  /per-platform hook, thesis, and learned headline/,
]) {
  requireMatch('frozen budget title contract', socialAgents, anchor);
}

if (failures.length > 0) {
  console.error('Social release contract check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Social release contract check passed.');
