import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(appRoot, '../..');
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

  it('requires an exact build ID instead of resolving latest', () => {
    const submitScript = path.join(
      appRoot,
      'scripts',
      'submit-production-build.mjs',
    );

    expect(() =>
      execFileSync(process.execPath, [submitScript, 'ios'], { encoding: 'utf8' }),
    ).toThrowError();
    expect(readAppFile('scripts', 'submit-production-build.mjs')).not.toContain(
      'build:list',
    );
  });

  it('captures the build ID from the same EAS build command', () => {
    const buildScript = readAppFile('scripts', 'build-production.mjs');
    expect(buildScript).toContain("'--json'");
    expect(buildScript).toContain('GITHUB_OUTPUT');
    expect(buildScript).toContain('build_id=');
  });
});

describe('iOS release version safety', () => {
  it('records the App Store Connect build floor used by CI preflight', () => {
    const baseline = JSON.parse(readAppFile('release-baselines.json')) as {
      ios?: { appVersion?: string; ascBuildNumberFloor?: number };
    };

    expect(baseline.ios).toMatchObject({
      appVersion: '2.1.0',
      ascBuildNumberFloor: 19,
    });
  });

  it('splits build and submit jobs so a submit retry cannot rebuild', () => {
    const workflow = readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'release-mobile.yml'),
      'utf8',
    );

    expect(workflow).toContain('build-ios:');
    expect(workflow).toContain('submit-ios:');
    expect(workflow).toContain('needs: [gate, build-ios]');
    expect(workflow).toContain('ios_build_id:');
    expect(workflow).not.toContain('Submit the latest production build');
  });
});
