import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { test } from 'node:test';
import {
  compareVersions,
  preflight,
  signingEnvironment,
  validateTag,
  validateMetadata,
  validateSignature,
  validateAssessment,
  publishDecision,
} from './desktop-release.mjs';
const configuredTeam = parse(
  readFileSync(
    new URL('../apps/desktop/electron-builder.yml', import.meta.url),
    'utf8',
  ),
).mac.identity;

test('strict tag and numeric versions', () => {
  assert.equal(validateTag('desktop-v0.2.0', '0.2.0'), '0.2.0');
  for (const tag of ['v0.2.0', 'desktop-v0.1.0', 'desktop-v0.2.0-beta'])
    assert.throws(() => validateTag(tag, '0.2.0'));
  assert.equal(compareVersions('1.10', '1.9'), 1);
  assert.equal(compareVersions('1.0', '1'), 0);
  assert.equal(compareVersions('01.0', '1.1'), -1);
  assert.equal(compareVersions('x', '1'), undefined);
});
test('credentials fail closed and support keychain or imported certificate', () => {
  const signing = { CSC_LINK: 'cert', CSC_KEY_PASSWORD: 'pass' };
  assert.throws(() =>
    preflight(
      { APPLE_KEYCHAIN_PROFILE: 'profile' },
      () =>
        `Developer ID Application: Other (OTHER)\nApple Development: Zap (${configuredTeam})`,
    ),
  );

  assert.throws(() => preflight({}, () => 'Apple Development'));
  assert.throws(() => preflight(signing, () => ''));
  preflight({ ...signing, APPLE_KEYCHAIN_PROFILE: 'profile' }, () => '');
  preflight(
    { APPLE_KEYCHAIN_PROFILE: 'profile' },
    () => `Developer ID Application: Zap (${configuredTeam})`,
  );
  const api = {
    ...signing,
    APPLE_API_KEY: '/key',
    APPLE_API_KEY_ID: 'id',
    APPLE_API_ISSUER: 'issuer',
  };
  let path;
  preflight(
    api,
    () => '',
    (key) => {
      path = key;
    },
  );
  assert.equal(path, '/key');
  assert.throws(() =>
    preflight(
      api,
      () => '',
      () => {
        throw new Error('unreadable');
      },
    ),
  );
});
test('signing environment excludes build and publishing secrets', () => {
  assert.deepEqual(
    signingEnvironment({
      PATH: 'bin',
      CSC_LINK: 'cert',
      LC_ALL: 'UTF-8',
      GH_TOKEN: 'secret',
      INFISICAL_TOKEN: 'secret',
      APPLE_ID: 'id',
      CSC_NAME: 'name',
      GITHUB_BASE_REF: 'main',
    }),
    { PATH: 'bin', CSC_LINK: 'cert', LC_ALL: 'UTF-8' },
  );
});
test('metadata verifies bytes and rejects paths and tampering', () => {
  const bytes = Buffer.from('zip'),
    sha512 = createHash('sha512').update(bytes).digest('base64');
  const metadata = {
    version: '0.2.0',
    path: 'app.zip',
    sha512,
    files: [{ url: 'app.zip', sha512, size: 3 }],
  };
  validateMetadata(metadata, '0.2.0', () => bytes);
  for (const change of [
    { version: '0.1.0' },
    { path: '../app.zip' },
    { sha512: 'bad' },
    { files: [] },
    { files: [{ url: 'app.zip', sha512, size: 2 }] },
  ])
    assert.throws(() =>
      validateMetadata({ ...metadata, ...change }, '0.2.0', () => bytes),
    );
});
test('signature and notarization diagnostics are enforced', () => {
  const output =
    'Authority=Developer ID Application: Zap\nTeamIdentifier=LP8CA4MT6U\nflags=0x10000(runtime)';
  const plist = '<key>com.apple.security.cs.allow-jit</key><true/>';
  validateSignature(output, plist, 'LP8CA4MT6U');
  for (const invalid of [
    output.replace('Developer ID Application', 'Apple Development'),
    output.replace('runtime', 'none'),
    output.replace('LP8CA4MT6U', 'other'),
  ])
    assert.throws(() => validateSignature(invalid, plist, 'LP8CA4MT6U'));
  assert.throws(() =>
    validateSignature(output, plist + '<key>extra</key><true/>', 'LP8CA4MT6U'),
  );
  validateAssessment('accepted\nsource=Notarized Developer ID');
  assert.throws(() => validateAssessment('rejected'));
});
test('publish refuses existing public releases and non-increasing versions', () => {
  assert.equal(publishDecision(undefined, undefined, '0.2.0'), 'create');
  assert.equal(
    publishDecision({ draft: true }, { tag_name: 'desktop-v0.1.0' }, '0.2.0'),
    'replace-draft',
  );
  assert.throws(() => publishDecision({ draft: false }, undefined, '0.2.0'));
  for (const tag of ['desktop-v0.2.0', 'desktop-v0.3.0', 'v1'])
    assert.throws(() => publishDecision(undefined, { tag_name: tag }, '0.2.0'));
});
