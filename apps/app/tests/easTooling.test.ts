import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const easScript = path.join(appRoot, 'scripts', 'eas.mjs');

function readAppFile(...segments: string[]): string {
  return readFileSync(path.join(appRoot, ...segments), 'utf8');
}

function easCliVersion(): string {
  const match = /EAS_CLI_VERSION = '([^']+)'/u.exec(
    readAppFile('scripts', 'eas.mjs'),
  );
  expect(match?.[1]).toBeDefined();

  return match![1]!;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index += 1
  ) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

interface EasJson {
  cli?: { version?: string };
  submit?: {
    production?: {
      android?: { applicationId?: string; track?: string };
      ios?: { ascAppId?: string };
    };
  };
}

function readEasJson(): EasJson {
  return JSON.parse(readAppFile('eas.json')) as EasJson;
}

/**
 * Runs `scripts/eas.mjs` against a stub `pnpm` on PATH that echoes its argv, so
 * the wrapper's argument handling is observable without contacting EAS.
 */
function runWrapperWithStubbedPnpm(
  args: string[],
  env: Record<string, string | undefined>,
): string {
  const binDir = mkdtempSync(path.join(tmpdir(), 'eas-wrapper-'));
  writeFileSync(path.join(binDir, 'pnpm'), '#!/bin/sh\necho "$@"\n', {
    mode: 0o755,
  });

  return execFileSync(process.execPath, [easScript, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: undefined,
      ...env,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  }).trim();
}

describe('EAS CLI version single source of truth', () => {
  it('routes every package script through the wrapper instead of pinning inline', () => {
    // Nine hardcoded `eas-cli@<version>` strings used to drift independently.
    expect(readAppFile('package.json')).not.toContain('eas-cli@');
  });

  it('satisfies the floor that eas.json requires of the CLI', () => {
    const range = readEasJson().cli?.version;
    expect(range).toMatch(/^>=\s*\d+\.\d+\.\d+$/u);

    const floor = range!.replace(/^>=\s*/u, '');
    expect(compareVersions(easCliVersion(), floor)).toBeGreaterThanOrEqual(0);
  });
});

describe('non-interactive behavior', () => {
  it('appends --non-interactive on CI so a prompt cannot hang the release job', () => {
    expect(
      runWrapperWithStubbedPnpm(['build', '--platform', 'android'], {
        CI: 'true',
      }),
    ).toBe(
      `dlx eas-cli@${easCliVersion()} build --platform android --non-interactive`,
    );
  });

  it('leaves local runs interactive so credential setup can still prompt', () => {
    expect(
      runWrapperWithStubbedPnpm(['credentials', '--platform', 'ios'], {}),
    ).toBe(`dlx eas-cli@${easCliVersion()} credentials --platform ios`);
  });

  it('does not duplicate an explicit --non-interactive flag', () => {
    expect(
      runWrapperWithStubbedPnpm(['build:list', '--non-interactive'], {
        CI: 'true',
      }),
    ).toBe(`dlx eas-cli@${easCliVersion()} build:list --non-interactive`);
  });
});

describe('store submission targets', () => {
  it('keeps Android submissions on the existing listing and testing track', () => {
    // Promotion to open testing or production is a deliberate Play Console
    // action; CI must never widen the audience on its own.
    expect(readEasJson().submit?.production?.android).toMatchObject({
      applicationId: 'com.fromfedtochain.app',
      track: 'alpha',
    });
  });

  it('requires a numeric ascAppId once iOS submission is configured', () => {
    const ios = readEasJson().submit?.production?.ios;

    if (ios) {
      expect(ios.ascAppId).toMatch(/^\d+$/u);
    }
  });

  it('refuses to submit without an explicit platform', () => {
    // Reaching eas-cli with no platform would submit against whatever the
    // profile happens to default to, so the wrapper rejects it first.
    const submitScript = path.join(
      appRoot,
      'scripts',
      'submit-latest-production.mjs',
    );

    expect(() =>
      execFileSync(process.execPath, [submitScript], { encoding: 'utf8' }),
    ).toThrowError();
  });
});
