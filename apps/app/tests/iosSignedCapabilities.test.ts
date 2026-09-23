import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertIosSignedCapabilities,
  readDeclaredCapabilities,
} from '../scripts/assert-ios-signed-capabilities.mjs';

const associatedDomains = 'com.apple.developer.associated-domains';

function entitlements(...keys: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0">',
    '  <dict>',
    ...keys.flatMap((key) => [
      `    <key>${key}</key>`,
      '    <array>',
      '      <string>applinks:from-fed-to-chain-api.fly.dev</string>',
      '    </array>',
    ]),
    '  </dict>',
    '</plist>',
    '',
  ].join('\n');
}

describe('iOS signed capability preflight', () => {
  let appRoot: string;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), 'zap-ios-capabilities-'));
    mkdirSync(join(appRoot, 'ios', 'ZapPilot'), { recursive: true });
  });

  afterEach(() => {
    rmSync(appRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeEntitlements(contents: string): void {
    writeFileSync(
      join(appRoot, 'ios', 'ZapPilot', 'ZapPilot.entitlements'),
      contents,
    );
  }

  function writeBaselines(capabilities: unknown): void {
    writeFileSync(
      join(appRoot, 'release-baselines.json'),
      JSON.stringify({ ios: { provisioningProfile: { capabilities } } }),
    );
  }

  it('reads only App ID capability keys from the generated entitlements', () => {
    const plist = entitlements(
      associatedDomains,
      'aps-environment',
      'keychain-access-groups',
    );

    expect(readDeclaredCapabilities(plist)).toEqual([
      'aps-environment',
      associatedDomains,
    ]);
  });

  it('fails with the capability name when the profile does not carry it', () => {
    writeEntitlements(entitlements(associatedDomains));
    writeBaselines([]);

    expect(() => assertIosSignedCapabilities(appRoot)).toThrow(
      new RegExp(`${associatedDomains}[\\s\\S]*ios-release\\.md`, 'u'),
    );
  });

  it('passes once the profile is recorded as carrying the capability', () => {
    writeEntitlements(entitlements(associatedDomains));
    writeBaselines([associatedDomains]);

    expect(() => assertIosSignedCapabilities(appRoot)).not.toThrow();
  });

  it('warns instead of failing when the profile is ahead of the build', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeEntitlements(entitlements());
    writeBaselines([associatedDomains]);

    expect(() => assertIosSignedCapabilities(appRoot)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(associatedDomains),
    );
  });

  it('treats a build with no entitlements file as declaring no capabilities', () => {
    writeBaselines([]);

    expect(() => assertIosSignedCapabilities(appRoot)).not.toThrow();
  });

  it('refuses an unrecorded or malformed profile baseline', () => {
    writeEntitlements(entitlements(associatedDomains));
    writeBaselines(undefined);

    expect(() => assertIosSignedCapabilities(appRoot)).toThrow(
      /ios\.provisioningProfile\.capabilities/u,
    );
  });
});
