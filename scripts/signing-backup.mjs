import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignoredDirectories = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.turbo',
  'build',
  'dist',
  'release',
  'Pods',
  'cache',
  'avd',
  '.signing-backups',
]);
const signingExtensions = new Set([
  '.jks',
  '.keystore',
  '.p12',
  '.p8',
  '.mobileprovision',
  '.provisionprofile',
  '.cer',
]);
const credentialNames =
  /^(credentials\.json|key\.properties|.*upload.*\.properties|.*(?:play-publisher|google-play-service-account).*\.json)$/i;
const signingEnvKeys = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'MAC_CSC_LINK',
  'MAC_CSC_KEY_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_KEY_P8',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
  'APPLE_KEYCHAIN_PROFILE',
];

export function discoverSigningFiles(directories, maxDepth = 5) {
  const files = new Set();
  function visit(path, depth) {
    if (!existsSync(path)) return;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) {
      const name = basename(path);
      if (
        name !== 'debug.keystore' &&
        (signingExtensions.has(extname(name).toLowerCase()) ||
          credentialNames.test(name))
      )
        files.add(resolve(path));
    } else if (stat.isDirectory() && depth >= 0) {
      for (const name of readdirSync(path).sort()) {
        if (!ignoredDirectories.has(name)) visit(join(path, name), depth - 1);
      }
    }
  }
  directories.forEach((path) => visit(path, maxDepth));
  return [...files].sort();
}

export function createSigningBackup({
  directories,
  outputDirectory,
  env = process.env,
  exportIdentities = exportAppleIdentities,
  archive = zipArchive,
}) {
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  chmodSync(outputDirectory, 0o700);
  const staging = mkdtempSync(join(outputDirectory, '.staging-'));
  chmodSync(staging, 0o700);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zip = join(outputDirectory, `signing-backup-${stamp}.zip`);
  const passwordPath = zip.replace(/\.zip$/, '.password.txt');
  const password = randomBytes(32).toString('base64url');
  const manifest = {
    createdAt: new Date().toISOString(),
    files: [],
    apple: null,
    gaps: [],
  };
  try {
    const filesDir = join(staging, 'files');
    const appleDir = join(staging, 'apple');
    mkdirSync(filesDir, { mode: 0o700 });
    mkdirSync(appleDir, { mode: 0o700 });
    for (const source of discoverSigningFiles(directories)) {
      const id = createHash('sha256').update(source).digest('hex').slice(0, 16);
      const file = `${id}-${basename(source)}`;
      const destination = join(filesDir, file);
      copyFileSync(source, destination);
      chmodSync(destination, 0o600);
      manifest.files.push({
        source,
        file: `files/${file}`,
        sha256: createHash('sha256')
          .update(readFileSync(destination))
          .digest('hex'),
      });
    }
    const signingEnv = Object.fromEntries(
      signingEnvKeys.filter((key) => env[key]).map((key) => [key, env[key]]),
    );
    for (const key of ['CSC_LINK', 'MAC_CSC_LINK']) {
      if (!env[key]) continue;
      const value = env[key];
      const target = join(filesDir, `${key}.p12`);
      if (existsSync(value)) copyFileSync(value, target);
      else if (/^[A-Za-z0-9+/=\r\n]+$/.test(value))
        writeFileSync(target, Buffer.from(value, 'base64'), { mode: 0o600 });
      else {
        manifest.gaps.push(
          `${key}: certificate must be local or base64; remote URLs are not downloaded`,
        );
        continue;
      }
      chmodSync(target, 0o600);
      manifest.files.push({ source: key, file: `files/${key}.p12` });
    }
    if (env.APPLE_API_KEY && existsSync(env.APPLE_API_KEY)) {
      copyFileSync(env.APPLE_API_KEY, join(filesDir, 'APPLE_API_KEY.p8'));
      chmodSync(join(filesDir, 'APPLE_API_KEY.p8'), 0o600);
    }
    if (env.APPLE_API_KEY_P8)
      writeFileSync(join(filesDir, 'APPLE_API_KEY.p8'), env.APPLE_API_KEY_P8, {
        mode: 0o600,
      });
    writeFileSync(
      join(staging, 'signing-environment.json'),
      JSON.stringify(signingEnv, null, 2),
      { mode: 0o600 },
    );
    writeFileSync(passwordPath, `${password}\n`, { mode: 0o600, flag: 'wx' });
    manifest.apple = exportIdentities(appleDir, password);
    if (manifest.apple.failures.length)
      manifest.gaps.push(
        'Some Apple identities could not be exported; see apple/identities.json',
      );
    if (
      !manifest.files.some((item) =>
        ['.jks', '.keystore'].includes(extname(item.file)),
      )
    )
      manifest.gaps.push('No Android release keystore found');
    for (const platform of ['ios', 'macos']) {
      if (!manifest.apple.exported.some((item) => item.platform === platform))
        manifest.gaps.push(
          `No ${platform} keychain identity exported; existing .p12 files may cover it, but their identity/password must be verified`,
        );
    }
    if (
      env.APPLE_KEYCHAIN_PROFILE &&
      !env.APPLE_API_KEY &&
      !env.APPLE_API_KEY_P8
    )
      manifest.gaps.push(
        'Notarytool keychain profile is a reference only; recover its API key/account credentials separately',
      );
    writeFileSync(
      join(staging, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600 },
    );
    writeFileSync(
      join(staging, 'RESTORE.md'),
      `# Signing backup\n\nUse manifest.json to restore files to their original locations. Import apple/*.p12 into the login keychain with Keychain Access; the generated p12 password is in the adjacent .password.txt file outside this ZIP. Existing keystores and p12 files retain their original passwords; exported Android .properties / credentials.json and signing-environment.json carry only passwords that were locally available. This ZIP contains private signing material and is stored with owner-only permissions.\n\nProvisioning profiles go back to their original profile directories. APPLE_KEYCHAIN_PROFILE is only a profile name, not its secret; recreate notarytool credentials from the original account/API key. Hardware/non-exportable keys and EAS-only remote credentials cannot be backed up by this local command. Check manifest gaps before treating this as a complete restore backup.\n`,
      { mode: 0o600 },
    );
    archive(staging, zip);
    chmodSync(zip, 0o600);
    return {
      zip,
      passwordPath,
      fileCount: manifest.files.length,
      identityCount: manifest.apple.exported.length,
      gaps: manifest.gaps,
    };
  } catch (error) {
    rmSync(zip, { force: true });
    rmSync(passwordPath, { force: true });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function exportAppleIdentities(directory, password) {
  const result = spawnSync(
    '/usr/bin/swift',
    [
      '-module-cache-path',
      join(directory, '.swift-cache'),
      join(root, 'scripts/export-apple-signing.swift'),
      directory,
    ],
    {
      input: `${password}\n`,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
    },
  );
  rmSync(join(directory, '.swift-cache'), { recursive: true, force: true });
  if (!existsSync(join(directory, 'identities.json')))
    throw new Error(
      'Apple signing export could not run. Ensure Xcode/Swift is installed.',
    );
  const report = JSON.parse(
    readFileSync(join(directory, 'identities.json'), 'utf8'),
  );
  if (result.error || result.status !== 0) {
    report.failures.push({
      operation: 'Apple export incomplete, interrupted or timed out',
    });
    writeFileSync(
      join(directory, 'identities.json'),
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
  }
  return report;
}

function zipArchive(directory, destination) {
  execFileSync(
    '/usr/bin/ditto',
    ['-c', '-k', '--norsrc', '--noextattr', directory, destination],
    { stdio: 'pipe' },
  );
}

function main(args) {
  if (args.includes('--help')) {
    console.log(
      'Usage: pnpm signing:backup [--include PATH] [--output DIRECTORY]\nCollects local signing files and exports Apple signing identities into an ignored private ZIP. Keychain may prompt for access.',
    );
    return;
  }
  if (process.platform !== 'darwin')
    throw new Error('Signing backup requires macOS for Apple keychain export');
  const home = homedir();
  const commonGit = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  const directories = [
    root,
    dirname(commonGit),
    join(home, '.android'),
    join(home, '.private_keys'),
    join(home, '.appstoreconnect/private_keys'),
    ...[
      'Downloads',
      'Documents',
      'Desktop',
      'Library/MobileDevice/Provisioning Profiles',
      'Library/Developer/Xcode/UserData/Provisioning Profiles',
    ].map((path) => join(home, path)),
  ];
  let outputDirectory = join(root, '.signing-backups');
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!['--include', '--output'].includes(arg) || !args[i + 1])
      throw new Error(`Invalid option: ${arg}`);
    const path = resolve(args[++i]);
    if (arg === '--include') directories.push(path);
    else outputDirectory = path;
  }
  const result = createSigningBackup({ directories, outputDirectory });
  console.log(
    `ZIP: ${result.zip}\nApple p12 password file: ${result.passwordPath}\nCollected ${result.fileCount} files and ${result.identityCount} Apple identities.`,
  );
  for (const gap of result.gaps) console.log(`Incomplete: ${gap}`);
  if (result.gaps.length) process.exitCode = 1;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
