#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { assertIosSignedCapabilities } from './assert-ios-signed-capabilities.mjs';
import {
  loadIosArchiveEnv,
  writeIosArchiveXcodeEnv,
} from './ios-archive-env.mjs';
import { prepareArchiveAppVersion } from './ios-release.mjs';
import { syncIosNative } from './sync-ios-native.mjs';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(appRoot, '..', '..');
const workspacePath = resolve(appRoot, 'ios', 'ZapPilot.xcworkspace');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with status ${result.status ?? 1}`,
    );
  }
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('Opening the iOS archive workspace requires macOS.');
  }

  // Local Xcode archives are production artifacts. Resolve the same canonical
  // prod environment that env:sync projects to EAS, then project only Expo
  // client values into the native build. Missing required mobile Privy config
  // fails here, before Xcode can create an installable-but-broken archive.
  const archiveEnv = loadIosArchiveEnv();
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { policy: { type: 'string', default: 'auto' } },
  });

  // Pin the App Version against App Store Connect before prebuild writes it
  // into Info.plist. EAS is the party this fallback exists to bypass, so it is
  // not consulted; the pin stays until the operator restores app.config.ts.
  await prepareArchiveAppVersion({ policy: values.policy });

  run(
    pnpmCommand,
    ['turbo', 'run', 'build', '--filter=@zapengine/app-core'],
    repoRoot,
    archiveEnv,
  );
  syncIosNative({ env: archiveEnv });
  // Prebuild has just written the entitlements Xcode will sign. Apple grants
  // those capabilities through the provisioning profile, which Xcode only
  // validates at the end of an archive, so check the recorded profile state
  // here instead of after a full build.
  assertIosSignedCapabilities(appRoot);
  const xcodeEnvPath = writeIosArchiveXcodeEnv(appRoot, archiveEnv);

  run('open', [workspacePath], appRoot, archiveEnv);
  console.log(
    `Opened the synchronized ZapPilot.xcworkspace with production Expo env in ${xcodeEnvPath}. Use Product → Archive.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
