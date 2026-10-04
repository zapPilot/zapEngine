import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('signed and unsigned packaging configurations preserve release invariants', () => {
  const config = parse(read('apps/desktop/electron-builder.yml'));
  assert.equal(config.forceCodeSigning, true);
  assert.equal(config.mac.notarize, true);
  assert.equal(config.mac.hardenedRuntime, true);
  assert.match(config.mac.identity, /^[A-Z0-9]{10}$/);
  assert.equal(config.mac.type, 'distribution');
  assert.equal(config.mac.entitlements, 'build/entitlements.mac.plist');
  assert.equal(config.mac.entitlementsInherit, config.mac.entitlements);
  assert.deepEqual(config.mac.target, [
    { target: 'dmg', arch: ['arm64'] },
    { target: 'zip', arch: ['arm64'] },
  ]);
  assert.equal(config.artifactName, 'Zap-Pilot-${os}-${arch}.${ext}');
  assert.deepEqual(config.publish, {
    provider: 'github',
    owner: 'zapPilot',
    repo: 'zapEngine',
    releaseType: 'release',
    tagNamePrefix: 'desktop-v',
  });
  assert.deepEqual(parse(read('apps/desktop/electron-builder.unsigned.yml')), {
    extends: './electron-builder.yml',
    forceCodeSigning: false,
    mac: { identity: null, notarize: false },
    publish: null,
  });
  assert.match(
    read('apps/landing-page/src/config/links.ts'),
    /releases\/latest\/download\/Zap-Pilot-mac-arm64\.dmg/,
  );
});
test('store URLs match canonical store identities', () => {
  const eas = JSON.parse(read('apps/app/eas.json'));
  const id = eas.submit.production.ios.ascAppId;
  for (const file of [
    'apps/app/app.config.ts',
    'apps/landing-page/src/config/links.ts',
  ]) {
    const text = read(file);
    assert.ok(text.includes(`https://apps.apple.com/app/id${id}`));
    assert.ok(
      text.includes(
        'https://play.google.com/store/apps/details?id=com.fromfedtochain.app',
      ),
    );
  }
});
