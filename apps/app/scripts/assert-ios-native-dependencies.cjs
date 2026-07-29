// CommonJS on purpose: Xcode's Expo bundle phase loads metro.config.js.
const fs = require('node:fs');
const path = require('node:path');

// These modules execute during cold start, so a JS/native mismatch produces an
// immediate crash instead of a recoverable feature error.
const REQUIRED_RELEASE_PODS = [
  {
    packageName: '@react-native-async-storage/async-storage',
    podName: 'RNCAsyncStorage',
  },
];

function isIosReleaseBuild(env) {
  const platform = env.PLATFORM_NAME ?? env.SDK_NAME ?? '';
  return env.CONFIGURATION === 'Release' && platform.startsWith('iphone');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function podVersion(lockfile, podName) {
  const match = new RegExp(
    `^  - ${escapeRegExp(podName)} \\(([^):]+)(?::[^)]*)?\\):`,
    'mu',
  ).exec(lockfile);
  return match?.[1] ?? null;
}

function failureMessage(details) {
  return [
    '',
    'iOS native dependencies are stale; refusing to create a broken Release app.',
    ...details.map((detail) => `  - ${detail}`),
    '',
    'The generated apps/app/ios directory is ignored by Git, so opening Xcode',
    'directly can leave Pods behind package.json. Synchronize it first:',
    '',
    '  pnpm --filter @zapengine/app ios:native:sync',
    '',
    'For TestFlight archives, use the supported entry point:',
    '',
    '  pnpm --filter @zapengine/app ios:archive',
    '',
  ].join('\n');
}

function assertIosNativeDependencies(appRoot, env = process.env) {
  if (!isIosReleaseBuild(env)) return;

  const podfileLockPath = path.join(appRoot, 'ios', 'Podfile.lock');
  const manifestLockPath = path.join(appRoot, 'ios', 'Pods', 'Manifest.lock');
  const missingLocks = [podfileLockPath, manifestLockPath].filter(
    (lockPath) => !fs.existsSync(lockPath),
  );

  if (missingLocks.length > 0) {
    throw new Error(
      failureMessage(
        missingLocks.map(
          (lockPath) => `missing ${path.relative(appRoot, lockPath)}`,
        ),
      ),
    );
  }

  const podfileLock = fs.readFileSync(podfileLockPath, 'utf8');
  const manifestLock = fs.readFileSync(manifestLockPath, 'utf8');
  const details = [];

  if (podfileLock !== manifestLock) {
    details.push('ios/Podfile.lock does not match ios/Pods/Manifest.lock');
  }

  for (const dependency of REQUIRED_RELEASE_PODS) {
    const packageJsonPath = path.join(
      appRoot,
      'node_modules',
      ...dependency.packageName.split('/'),
      'package.json',
    );

    if (!fs.existsSync(packageJsonPath)) {
      details.push(`missing installed package ${dependency.packageName}`);
      continue;
    }

    const packageVersion = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8'),
    ).version;
    const lockedVersion = podVersion(podfileLock, dependency.podName);

    if (lockedVersion === null) {
      details.push(
        `${dependency.packageName}@${packageVersion} has no ${dependency.podName} Pod`,
      );
    } else if (lockedVersion !== packageVersion) {
      details.push(
        `${dependency.packageName}@${packageVersion} is paired with ` +
          `${dependency.podName}@${lockedVersion}`,
      );
    }
  }

  if (details.length > 0) {
    throw new Error(failureMessage(details));
  }
}

module.exports = assertIosNativeDependencies;
module.exports.isIosReleaseBuild = isIosReleaseBuild;
module.exports.podVersion = podVersion;
