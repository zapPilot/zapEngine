#!/usr/bin/env node
// iOS release entry point: resolves the App Version against App Store Connect,
// pins it in this checkout's app.config.ts (never committed), proves EAS will
// build that exact version, then runs the production build.
import {
  appendFileSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  fetchIosVersionState,
  takeAppStoreConnectCredentials,
} from './app-store-connect.mjs';
import { runProductionBuild } from './build-production.mjs';
import { runEasJson } from './eas.mjs';
import {
  IOS_VERSION_POLICIES,
  pinCommittedAppVersion,
  readCommittedAppVersion,
  resolveIosAppVersion,
} from './ios-app-version.mjs';

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function readJson(appRoot, name) {
  return JSON.parse(readFileSync(path.join(appRoot, name), 'utf8'));
}

function readAscAppId(appRoot) {
  const appId = readJson(appRoot, 'eas.json').submit?.production?.ios?.ascAppId;

  if (!/^\d+$/u.test(appId ?? '')) {
    throw new Error('eas.json has no numeric submit.production.ios.ascAppId.');
  }

  return appId;
}

async function resolveFromAppStoreConnect({ appRoot, policy, env, fetchImpl }) {
  const credentials = takeAppStoreConnectCredentials(env);
  const configPath = path.join(appRoot, 'app.config.ts');
  const original = readFileSync(configPath, 'utf8');
  const committed = readCommittedAppVersion(original);
  const state = await fetchIosVersionState({
    appId: readAscAppId(appRoot),
    credentials,
    fetchImpl,
  });
  const decision = resolveIosAppVersion({ policy, committed, ...state });

  return { decision, state, configPath, original };
}

function describeAscState(state) {
  const topTrain = [...state.trainVersions].sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true }),
  )[0];
  const topStore = [...state.storeVersions].sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  )[0];

  return (
    `highest TestFlight train ${topTrain ?? 'none'}; ` +
    `highest App Store version ${
      topStore ? `${topStore.version} (${topStore.state})` : 'none'
    }`
  );
}

function readRemoteBuildNumber(appRoot) {
  const floor = Number(
    readJson(appRoot, 'release-baselines.json').ios?.ascBuildNumberFloor,
  );

  if (!Number.isSafeInteger(floor) || floor < 1) {
    throw new Error(
      'release-baselines.json has no valid ios.ascBuildNumberFloor.',
    );
  }

  const payload = runEasJson([
    'build:version:get',
    '--platform',
    'ios',
    '--profile',
    'production',
    '--json',
    '--non-interactive',
  ]);
  const raw = payload.buildNumber;

  if (raw == null || String(raw).trim() === '') {
    throw new Error(
      'EAS remote iOS build number is not initialized (buildNumber is missing). ' +
        `Run ios:version:init once and set the remote value to at least ${floor} before retrying.`,
    );
  }

  const remote = Number(raw);

  if (!Number.isSafeInteger(remote) || remote < 1) {
    throw new Error(
      `EAS did not return a valid remote iOS build number: ${String(raw)}.`,
    );
  }

  if (remote < floor) {
    throw new Error(
      `EAS remote iOS build number ${remote} is below App Store Connect floor ${floor}. ` +
        'Refusing to burn another invalid build number. ' +
        `Run ios:version:init once and set the remote value to at least ${floor} before retrying.`,
    );
  }

  return { remote, floor };
}

function printDecision({ decision, state, remote, floor }) {
  const lines = [
    'iOS Version Resolution',
    '',
    `Policy: ${decision.policy}`,
    `Committed App Version: ${decision.committed} (app.config.ts)`,
    `App Store Connect: ${describeAscState(state)}`,
    `Current App Version: ${decision.current}`,
    `Apple Version Status: ${decision.closed ? 'CLOSED' : 'OPEN'} (${decision.currentState})`,
    `Resolved App Version: ${decision.version}`,
  ];

  if (remote !== undefined) {
    lines.push(
      '',
      `EAS Remote Build Number: ${remote} (historical floor ${floor})`,
      `Next Build Number: managed by EAS (expected ${remote + 1})`,
    );
  }

  for (const warning of decision.warnings) {
    lines.push('', `Warning: ${warning}`);
  }

  console.log(lines.join('\n'));

  return lines;
}

function appendSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, 'utf8');
  }
}

/**
 * Xcode archive path: ASC only (EAS is the party that may be broken in a
 * fallback). The pin is deliberately NOT restored — the archive happens later
 * and expo-constants re-reads app.config.ts during the Xcode build.
 */
export async function prepareArchiveAppVersion({
  appRoot = APP_ROOT,
  policy = 'auto',
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const { decision, state, configPath, original } =
    await resolveFromAppStoreConnect({ appRoot, policy, env, fetchImpl });

  printDecision({ decision, state });

  if (decision.version !== decision.committed) {
    writeFileSync(
      configPath,
      pinCommittedAppVersion(original, decision.version),
      'utf8',
    );
    console.log(
      `Pinned app.config.ts version ${decision.committed} -> ${decision.version} for this archive. ` +
        'Restore it with `git checkout -- apps/app/app.config.ts` after archiving.',
    );
  }

  return decision;
}

function installRestore(configPath, original) {
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;

    try {
      writeFileSync(configPath, original, 'utf8');
    } catch (error) {
      console.warn(
        `Warning: could not restore ${configPath} (${error instanceof Error ? error.message : String(error)}). ` +
          'Run `git checkout -- apps/app/app.config.ts`.',
      );
    }
  };

  process.on('exit', restore);

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => process.exit(130));
  }
}

function assertEffectiveVersion(appRoot, version) {
  const payload = runEasJson([
    'config',
    '--platform',
    'ios',
    '--profile',
    'production',
    '--json',
    '--non-interactive',
  ]);
  const appConfig = payload?.appConfig ?? {};
  const iosVersion = appConfig.ios?.version;

  if (
    appConfig.version !== version ||
    (iosVersion != null && iosVersion !== version)
  ) {
    throw new Error(
      `Version synchronization failed: eas config reports version ${String(appConfig.version)} ` +
        `(ios.version ${String(iosVersion)}), expected ${version}.`,
    );
  }
}

async function runBuild({ appRoot, policy, env, fetchImpl }) {
  const resolved = await resolveFromAppStoreConnect({
    appRoot,
    policy,
    env,
    fetchImpl,
  });
  const { decision, state, configPath, original } = resolved;
  const { remote, floor } = readRemoteBuildNumber(appRoot);
  const lines = printDecision({ decision, state, remote, floor });

  if (decision.version !== decision.committed) {
    installRestore(configPath, original);
    writeFileSync(
      configPath,
      pinCommittedAppVersion(original, decision.version),
      'utf8',
    );
  }

  assertEffectiveVersion(appRoot, decision.version);
  console.log('Version synchronization: successful\nPreflight: passed');

  const build = runProductionBuild('ios', {
    message: `App Version ${decision.version} (ios_version_policy=${policy})`,
  });

  if (build.appVersion !== decision.version) {
    throw new Error(
      `Version synchronization failed: EAS built app version ${String(build.appVersion)}, expected ${decision.version}. Not handing this build to submit.`,
    );
  }

  const builtNumber = Number(build.appBuildVersion);

  if (!Number.isSafeInteger(builtNumber) || builtNumber <= remote) {
    throw new Error(
      `EAS build number ${String(build.appBuildVersion)} did not advance past ${remote}. Not handing this build to submit.`,
    );
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `build_id=${build.id}\napp_version=${decision.version}\nbuild_number=${builtNumber}\n`,
      'utf8',
    );
  }

  appendSummary(
    [
      '### iOS release',
      '',
      '| Field | Value |',
      '| --- | --- |',
      `| Policy | ${policy} |`,
      `| Current App Version | ${decision.current} |`,
      `| Resolved App Version | ${decision.version} |`,
      `| Build number | ${builtNumber} |`,
      `| EAS build ID | ${build.id} |`,
      '',
      '```text',
      ...lines,
      '```',
    ].join('\n'),
  );
}

async function main(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    options: { policy: { type: 'string', default: 'auto' } },
    allowPositionals: true,
  });
  const [command] = positionals;
  const policy = values.policy;

  if (!IOS_VERSION_POLICIES.includes(policy)) {
    throw new Error(
      `Unknown --policy "${policy}". Expected ${IOS_VERSION_POLICIES.join(' | ')}.`,
    );
  }

  const context = {
    appRoot: APP_ROOT,
    policy,
    env: process.env,
    fetchImpl: fetch,
  };

  if (command === 'resolve') {
    const { decision, state } = await resolveFromAppStoreConnect(context);
    const { remote, floor } = readRemoteBuildNumber(APP_ROOT);

    printDecision({ decision, state, remote, floor });
  } else if (command === 'build') {
    await runBuild(context);
  } else {
    throw new Error('Usage: ios-release.mjs <resolve|build> [--policy P]');
  }
}

// Compare real paths so a symlinked checkout or temp dir (macOS /var ->
// /private/var) does not make the CLI silently do nothing.
function isEntryPoint() {
  return (
    process.argv[1] !== undefined &&
    realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
  );
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`iOS release failed: ${message}`);
    process.exit(1);
  });
}
