import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { publish } from './desktop-publish.mjs';
export { publishDecision } from './desktop-publish.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const desktop = join(root, 'apps/desktop');
const releaseDir = join(desktop, 'release');
const credentialKeys = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
  'APPLE_KEYCHAIN_PROFILE',
];
const config = () =>
  parse(readFileSync(join(desktop, 'electron-builder.yml'), 'utf8'));
const version = () =>
  JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')).version;
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function compareVersions(a, b) {
  if (![a, b].every((v) => /^\d+(\.\d+)*$/.test(v))) return undefined;
  const x = a.split('.').map(BigInt),
    y = b.split('.').map(BigInt);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0n) !== (y[i] ?? 0n))
      return (x[i] ?? 0n) > (y[i] ?? 0n) ? 1 : -1;
  }
  return 0;
}

export function signingEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) =>
        value !== undefined &&
        (credentialKeys.includes(key) ||
          ['PATH', 'HOME', 'TMPDIR', 'USER', 'LANG', 'CI'].includes(key) ||
          key.startsWith('LC_')),
    ),
  );
}

export function preflight(
  env = process.env,
  identities = () =>
    run('security', ['find-identity', '-v', '-p', 'codesigning']),
  readable = (path) => accessSync(path, constants.R_OK),
) {
  const team = config().mac.identity;
  const imported = Boolean(env.CSC_LINK && env.CSC_KEY_PASSWORD);
  assert(
    imported ||
      identities()
        .split('\n')
        .some(
          (line) =>
            line.includes('Developer ID Application:') &&
            line.includes(`(${team})`),
        ),
    'Developer ID Application signing credentials are required',
  );
  if (env.APPLE_KEYCHAIN_PROFILE) return;
  assert(
    env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER,
    'Notarization credentials are required',
  );
  readable(env.APPLE_API_KEY);
}

export function validateTag(tag, packageVersion) {
  assert(
    /^desktop-v\d+\.\d+\.\d+$/.test(tag ?? '') &&
      tag === `desktop-v${packageVersion}`,
    'Tag must match desktop package version',
  );
  return packageVersion;
}

export function validateMetadata(metadata, packageVersion, readAsset) {
  assert(
    metadata.version === packageVersion,
    'Update metadata version mismatch',
  );
  assert(
    typeof metadata.path === 'string' &&
      basename(metadata.path) === metadata.path &&
      metadata.path.endsWith('.zip'),
    'Update path must name the zip asset',
  );
  const file = metadata.files?.find((file) => file.url === metadata.path);
  assert(file, 'Update zip missing from files');
  for (const entry of metadata.files) {
    assert(basename(entry.url) === entry.url, 'Unsafe asset path');
    const bytes = readAsset(entry.url);
    assert(
      entry.size === bytes.length &&
        entry.sha512 === createHash('sha512').update(bytes).digest('base64'),
      'Update asset digest or size mismatch',
    );
  }
  assert(metadata.sha512 === file.sha512, 'Update path digest mismatch');
}

export function validateSignature(output, entitlements, team) {
  assert(
    output.includes('Authority=Developer ID Application:') &&
      output.includes(`TeamIdentifier=${team}\n`),
    'Developer ID authority or team mismatch',
  );
  assert(/flags=.*\bruntime\b/.test(output), 'Hardened runtime is required');
  const keys = [...entitlements.matchAll(/<key>([^<]+)<\/key>/g)].map(
    (match) => match[1],
  );
  assert(
    keys.length === 1 &&
      keys[0] === 'com.apple.security.cs.allow-jit' &&
      /<true\s*\/>/.test(entitlements),
    'Unexpected signing entitlements',
  );
}

export function validateAssessment(output) {
  assert(
    /accepted/.test(output) && /source=Notarized Developer ID/.test(output),
    'Gatekeeper did not accept notarized Developer ID',
  );
}

function diagnostic(command, args) {
  try {
    return run(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(
      `${command} verification failed: ${error.stderr?.toString() ?? error.message}`,
    );
  }
}
// codesign/spctl print display diagnostics to stderr even on success, which is
// why these calls previously went through `/bin/sh -c ... 2>&1`. The shell
// made every app path an injection sink (CodeQL
// js/shell-command-injection-from-environment), so capture both pipes
// directly instead: no shell, no re-parsing, same combined text.
function captureOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(
      `${command} verification failed: ${output.trim() || `exit ${result.status}`}`,
    );
  }
  return output;
}
// Entitlements plumbing discards stderr (previously `2>/dev/null`).
function captureStdout(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} verification failed: ${(result.stdout ?? '').trim() || `exit ${result.status}`}`,
    );
  }
  return result.stdout ?? '';
}
function signature(app) {
  diagnostic('codesign', ['--verify', '--deep', '--strict', app]);
  const output = captureOutput('codesign', ['-d', '--verbose=4', app]);
  const entitlements = captureStdout('codesign', [
    '-d',
    '--entitlements',
    ':-',
    app,
  ]);
  validateSignature(output, entitlements, config().mac.identity);
}
function verifyApp(app) {
  signature(app);
  const frameworks = join(app, 'Contents/Frameworks');
  for (const name of readdirSync(frameworks))
    if (name.endsWith('.app')) signature(join(frameworks, name));
  diagnostic('xcrun', ['stapler', 'validate', app]);
  if (/disabled/.test(run('spctl', ['--status']))) {
    try {
      run('sudo', ['-n', 'spctl', '--master-enable']);
    } catch {
      throw new Error(
        'Gatekeeper assessment disabled; verification incomplete',
      );
    }
  }
  const assessment = captureOutput('spctl', [
    '--assess',
    '--type',
    'execute',
    '--verbose=2',
    app,
  ]);
  validateAssessment(assessment);
  const update = parse(
    readFileSync(join(app, 'Contents/Resources/app-update.yml'), 'utf8'),
  );
  assert(
    update.provider === 'github' &&
      update.owner === 'zapPilot' &&
      update.repo === 'zapEngine',
    'Wrong updater repository',
  );
}
export function assets(dir) {
  const names = [
    'Zap-Pilot-mac-arm64.dmg',
    'Zap-Pilot-mac-arm64.dmg.blockmap',
    'Zap-Pilot-mac-arm64.zip',
    'Zap-Pilot-mac-arm64.zip.blockmap',
    'latest-mac.yml',
  ];
  return names.map((name) => {
    const path = join(dir, name);
    accessSync(path, constants.R_OK);
    return path;
  });
}
export function verify(dir = releaseDir) {
  assets(dir);
  validateMetadata(
    parse(readFileSync(join(dir, 'latest-mac.yml'), 'utf8')),
    version(),
    (name) => readFileSync(join(dir, name)),
  );
  verifyApp(join(dir, 'mac-arm64/Zap Pilot.app'));
  const scratch = mkdtempSync(join(tmpdir(), 'zap-desktop-verify-'));
  let mounted = false;
  try {
    run('ditto', [
      '-x',
      '-k',
      join(dir, 'Zap-Pilot-mac-arm64.zip'),
      join(scratch, 'zip'),
    ]);
    verifyApp(join(scratch, 'zip/Zap Pilot.app'));
    run('hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-mountpoint',
      join(scratch, 'dmg'),
      join(dir, 'Zap-Pilot-mac-arm64.dmg'),
    ]);
    mounted = true;
    verifyApp(join(scratch, 'dmg/Zap Pilot.app'));
  } finally {
    if (mounted) run('hdiutil', ['detach', join(scratch, 'dmg')]);
    rmSync(scratch, { recursive: true, force: true });
  }
}
export function checkTag(tag) {
  validateTag(tag, version());
  run('git', ['merge-base', '--is-ancestor', `${tag}^{commit}`, 'origin/main']);
  assert(
    run('git', ['rev-parse', `${tag}^{commit}`]).trim() ===
      run('git', ['rev-parse', 'HEAD']).trim(),
    'Checkout must match release tag',
  );
  return version();
}
const bundle = () =>
  run(
    'node',
    [
      'scripts/env/run.mjs',
      '--environment',
      'prod',
      '--client-target',
      'desktop',
      '--',
      'turbo',
      'run',
      'package:bundle',
      '--filter=@zapengine/desktop',
      '--force',
    ],
    { stdio: 'inherit' },
  );
const sign = () => {
  preflight();
  rmSync(releaseDir, { recursive: true, force: true });
  run('pnpm', ['exec', 'electron-builder', '--mac', '--publish', 'never'], {
    cwd: desktop,
    env: signingEnvironment(process.env),
    stdio: 'inherit',
  });
};
export function main(args) {
  const [command, tag, flag, dir] = args;
  switch (command) {
    case 'preflight':
      return preflight();
    case 'bundle':
      return bundle();
    case 'sign':
      return sign();
    case 'verify':
      return verify();
    case 'build':
      preflight();
      bundle();
      sign();
      return verify();
    case 'check-tag':
      return console.log(checkTag(tag));
    case 'publish':
      assert(
        flag === '--dir' && dir,
        'publish requires <tag> --dir <directory>',
      );
      return publish(tag, resolve(dir));
    default:
      throw new Error(
        'Expected preflight|bundle|sign|verify|build|check-tag|publish',
      );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
