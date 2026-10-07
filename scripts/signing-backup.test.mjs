import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createSigningBackup,
  discoverSigningFiles,
} from './signing-backup.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'signing-backup-test-'));
  const sources = join(directory, 'source');
  mkdirSync(sources);
  writeFileSync(join(sources, 'release.jks'), 'existing-key');
  writeFileSync(
    join(sources, 'release-upload.properties'),
    'keyAlias=upload\nstorePassword=fixture-secret',
  );
  writeFileSync(join(sources, 'debug.keystore'), 'debug');
  writeFileSync(join(sources, 'unrelated.json'), 'unrelated');
  mkdirSync(join(sources, 'node_modules'));
  writeFileSync(join(sources, 'node_modules', 'other.p12'), 'unrelated');
  return { directory, sources };
}

test('discovers release keys and password sidecars, skips caches, debug keys and symlinks, deduplicates roots', () => {
  const { directory, sources } = fixture();
  try {
    symlinkSync(join(sources, 'release.jks'), join(sources, 'linked.jks'));
    assert.deepEqual(discoverSigningFiles([sources, sources]), [
      join(sources, 'release-upload.properties'),
      join(sources, 'release.jks'),
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test(
  'creates a private restorable ZIP with a separate p12 password and only signing env secrets',
  { skip: process.platform !== 'darwin' },
  () => {
    const { directory, sources } = fixture();
    try {
      const outputDirectory = join(directory, '.signing-backups');
      const result = createSigningBackup({
        directories: [sources],
        outputDirectory,
        env: {
          CSC_KEY_PASSWORD: 'p12-original',
          UNRELATED_SECRET: 'must-not-copy',
        },
        exportIdentities: (path, password) => {
          assert.ok(password.length >= 32);
          writeFileSync(join(path, 'ios.p12'), 'fixture-ios');
          writeFileSync(join(path, 'macos.p12'), 'fixture-macos');
          return {
            exported: [
              { platform: 'ios', file: 'ios.p12' },
              { platform: 'macos', file: 'macos.p12' },
            ],
            failures: [],
          };
        },
      });
      assert.deepEqual(result.gaps, []);
      assert.equal(statSync(result.zip).mode & 0o777, 0o600);
      assert.equal(statSync(result.passwordPath).mode & 0o777, 0o600);
      assert.equal(statSync(outputDirectory).mode & 0o777, 0o700);
      const restored = join(directory, 'restored');
      execFileSync('/usr/bin/ditto', ['-x', '-k', result.zip, restored]);
      const manifest = JSON.parse(
        readFileSync(join(restored, 'manifest.json'), 'utf8'),
      );
      const key = manifest.files.find((item) =>
        item.source.endsWith('release.jks'),
      );
      assert.equal(
        readFileSync(join(restored, key.file), 'utf8'),
        'existing-key',
      );
      assert.deepEqual(
        JSON.parse(
          readFileSync(join(restored, 'signing-environment.json'), 'utf8'),
        ),
        { CSC_KEY_PASSWORD: 'p12-original' },
      );
      assert.ok(
        !readdirSync(restored).some((name) => name.endsWith('.password.txt')),
      );
      assert.ok(
        !readdirSync(outputDirectory).some((name) =>
          name.startsWith('.staging-'),
        ),
      );
      assert.equal(
        readFileSync(join(sources, 'release.jks'), 'utf8'),
        'existing-key',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('reports missing and non-exportable signing materials instead of claiming completeness', () => {
  const { directory, sources } = fixture();
  try {
    const result = createSigningBackup({
      directories: [],
      outputDirectory: join(directory, 'output'),
      env: {
        APPLE_KEYCHAIN_PROFILE: 'profile',
        CSC_LINK: 'https://remote.invalid/key',
      },
      exportIdentities: () => ({ exported: [], failures: [{ status: -50 }] }),
      archive: (_path, destination) =>
        writeFileSync(destination, 'fake-archive'),
    });
    assert.equal(result.gaps.length, 6);
    assert.ok(result.gaps.some((gap) => gap.includes('No Android')));
    assert.ok(result.gaps.some((gap) => gap.includes('No ios')));
    assert.ok(result.gaps.some((gap) => gap.includes('No macos')));
    assert.ok(existsSync(result.zip));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('removes partial archives, staging secrets and generated password when archiving fails', () => {
  const { directory, sources } = fixture();
  const outputDirectory = join(directory, 'output');
  try {
    assert.throws(
      () =>
        createSigningBackup({
          directories: [sources],
          outputDirectory,
          env: {},
          exportIdentities: () => ({ exported: [], failures: [] }),
          archive: (_path, destination) => {
            writeFileSync(destination, 'partial');
            throw new Error('disk full');
          },
        }),
      /disk full/,
    );
    assert.deepEqual(readdirSync(outputDirectory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
