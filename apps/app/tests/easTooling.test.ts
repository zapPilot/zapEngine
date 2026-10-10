import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runScriptWithEasStub } from './support/easCliStub';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(appRoot, '../..');
const easScript = path.join(appRoot, 'scripts', 'eas.mjs');
const buildScript = path.join(appRoot, 'scripts', 'build-production.mjs');
const submitScript = path.join(
  appRoot,
  'scripts',
  'submit-production-build.mjs',
);

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

interface IosReleaseBaseline {
  appVersion?: string;
  ascBuildNumberFloor?: number;
}

function readIosBaseline(): IosReleaseBaseline {
  const baseline = JSON.parse(readAppFile('release-baselines.json')) as {
    ios?: IosReleaseBaseline;
  };

  return baseline.ios ?? {};
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

  it('lets inherently non-interactive commands disable flag injection', () => {
    const source = readAppFile('scripts', 'eas.mjs');
    expect(source).toContain('addNonInteractive = true');
    expect(source).toContain('addNonInteractive &&');
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
});

describe('build-production captures exact build ID', () => {
  it('carries the exact build ID from the same EAS build invocation', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'eas-out-'));
    const githubOutput = path.join(outDir, 'github_output');
    writeFileSync(githubOutput, '', { encoding: 'utf8' });

    const buildJson = JSON.stringify([
      null,
      { id: 'build-id-123', status: 'FINISHED', appBuildVersion: '42' },
    ]);

    const { status, stdout, calls } = runScriptWithEasStub(
      buildScript,
      ['android'],
      {
        CI: 'true',
        EAS_BUILD_JSON: buildJson,
        GITHUB_OUTPUT: githubOutput,
      },
    );

    expect(status).toBe(0);
    expect(stdout).toContain('Built production android build build-id-123');
    expect(stdout).toContain('build version 42');
    expect(readFileSync(githubOutput, 'utf8')).toBe('build_id=build-id-123\n');
    expect(calls).toContain(
      'build --platform android --profile production --json --non-interactive',
    );
    expect(calls).toContain('--json');
  });

  it('fails when the build status is not FINISHED (CANCELED)', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'eas-out-'));
    const githubOutput = path.join(outDir, 'github_output');
    writeFileSync(githubOutput, '', { encoding: 'utf8' });

    const buildJson = JSON.stringify([
      { id: 'build-canceled', status: 'CANCELED', appBuildVersion: '43' },
    ]);

    const { status, stderr, calls } = runScriptWithEasStub(
      buildScript,
      ['android'],
      {
        CI: 'true',
        EAS_BUILD_JSON: buildJson,
        GITHUB_OUTPUT: githubOutput,
      },
    );

    expect(status).toBe(1);
    expect(stderr).toContain('CANCELED');
    expect(stderr).toContain('expected FINISHED');
    expect(readFileSync(githubOutput, 'utf8')).toBe('');
    expect(calls).toContain('build --platform android');
  });

  it('fails when no build ID is returned', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'eas-out-'));
    const githubOutput = path.join(outDir, 'github_output');
    writeFileSync(githubOutput, '', { encoding: 'utf8' });

    const buildJson = JSON.stringify([null, { status: 'FINISHED' }]);

    const { status, stderr } = runScriptWithEasStub(buildScript, ['android'], {
      CI: 'true',
      EAS_BUILD_JSON: buildJson,
      GITHUB_OUTPUT: githubOutput,
    });

    expect(status).toBe(1);
    expect(stderr).toContain('without returning a production');
  });

  it('fails when EAS returns non-array JSON', () => {
    const { status, stderr } = runScriptWithEasStub(buildScript, ['android'], {
      CI: 'true',
      EAS_BUILD_JSON: JSON.stringify({ id: 'not-an-array' }),
    });

    expect(status).toBe(1);
    expect(stderr).toContain('was not an array');
  });
});

describe('build-production iOS boundary', () => {
  it('refuses iOS so a build cannot bypass the version preflight', () => {
    const { status, stderr, calls } = runScriptWithEasStub(
      buildScript,
      ['ios'],
      { CI: 'true' },
    );

    expect(status).toBe(1);
    expect(stderr).toContain('ios:release');
    expect(calls).toBe('');
  });

  it('has no side effects when imported', () => {
    const importer = path.join(
      mkdtempSync(path.join(tmpdir(), 'eas-import-')),
      'import.mjs',
    );
    writeFileSync(importer, `import ${JSON.stringify(buildScript)};\n`);

    const { status, stdout, calls } = runScriptWithEasStub(importer, [], {});

    expect(status).toBe(0);
    expect(stdout).toBe('');
    expect(calls).toBe('');
  });
});

describe('submit-production-build validates exact build', () => {
  it('requires an exact build ID', () => {
    const { status, stderr, calls } = runScriptWithEasStub(
      submitScript,
      ['ios'],
      { CI: 'true' },
    );

    expect(status).toBe(1);
    expect(stderr).toContain('An exact EAS build ID is required');
    expect(calls).toBe('');
  });

  it('rejects a forwarded "--" rather than dropping the real build ID', () => {
    // `pnpm <script> -- <id>` passes the literal `--` through, so this is the
    // argv the workflow produced before the invocation was corrected.
    const { status, stderr, calls } = runScriptWithEasStub(
      submitScript,
      ['ios', '--', 'real-build-id'],
      { CI: 'true' },
    );

    expect(status).toBe(1);
    expect(stderr).toContain('Expected an EAS build ID');
    expect(calls).toBe('');
  });

  it('rejects a build with non-store distribution and does not submit', () => {
    const viewJson = JSON.stringify({
      id: 'build-internal',
      platform: 'ios',
      buildProfile: 'production',
      distribution: 'internal',
      status: 'finished',
    });

    const { status, stderr, calls } = runScriptWithEasStub(
      submitScript,
      ['ios', 'build-internal'],
      {
        CI: 'true',
        EAS_BUILD_VIEW_JSON: viewJson,
      },
    );

    expect(status).toBe(1);
    expect(stderr).toContain('distribution');
    expect(stderr).toContain('internal');
    expect(calls).toContain('build:view build-internal --json');
    expect(calls).not.toContain('submit --platform');
    expect(calls).not.toContain('build:list');
  });

  it('validates the build and submits with the exact ID without re-resolving latest', () => {
    const viewJson = JSON.stringify({
      id: 'build-id-999',
      platform: 'ios',
      buildProfile: 'production',
      distribution: 'store',
      status: 'finished',
    });

    const { status, stdout, calls } = runScriptWithEasStub(
      submitScript,
      ['ios', 'build-id-999'],
      {
        CI: 'true',
        EAS_BUILD_VIEW_JSON: viewJson,
      },
    );

    expect(status).toBe(0);
    expect(stdout).toContain('Submitting production ios build build-id-999');

    const lines = calls.trim().split('\n');
    expect(lines[0]).toBe(
      `dlx eas-cli@${easCliVersion()} build:view build-id-999 --json`,
    );
    // build:view is inherently non-interactive: even on CI it must not inject --non-interactive
    expect(lines[0]).not.toContain('--non-interactive');
    expect(lines[1]).toBe(
      `dlx eas-cli@${easCliVersion()} submit --platform ios --profile production --id build-id-999 --non-interactive`,
    );
    expect(calls).not.toContain('build:list');
    // Submission never touches versions: only the view and the submit call.
    expect(lines).toHaveLength(2);
  });

  it('never calls build:list', () => {
    const viewJson = JSON.stringify({
      id: 'bid',
      platform: 'android',
      buildProfile: 'production',
      distribution: 'store',
      status: 'finished',
    });

    const { calls } = runScriptWithEasStub(submitScript, ['android', 'bid'], {
      CI: 'true',
      EAS_BUILD_VIEW_JSON: viewJson,
    });

    expect(calls).not.toContain('build:list');
  });
});

describe('iOS release version safety', () => {
  it('records the App Store Connect build floor used by CI preflight', () => {
    // 204 is the final Flutter release 2.0.4 (204) on ASC app 6749248542, the
    // listing this app continues.
    expect(readIosBaseline().ascBuildNumberFloor).toBe(204);
    // Dynamic state lives in App Store Connect, not in Git.
    expect(readIosBaseline()).not.toHaveProperty('appVersion');
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

  it('hands the build ID to the submit wrapper as a bare argument', () => {
    // pnpm forwards a literal `--` to the script, so `<script> -- "$BUILD_ID"`
    // would submit `--` and drop the ID that the build job just produced.
    const workflow = readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'release-mobile.yml'),
      'utf8',
    );

    expect(workflow).toContain('android:submit "$BUILD_ID"');
    expect(workflow).toContain('ios:submit "$BUILD_ID"');
    expect(workflow).not.toContain('submit -- "$BUILD_ID"');
  });
});

describe('EAS post-install workspace build', () => {
  // The hook is never executed by CI, so the filter can only be proven by
  // asking turbo which packages it actually selects. A transposed filter
  // (`^pkg...` instead of `pkg^...`) aborts the whole EAS build.
  function postInstallFilter(): string {
    const script = (
      JSON.parse(readAppFile('package.json')) as {
        scripts?: Record<string, string>;
      }
    ).scripts?.['eas-build-post-install'];

    const match = /--filter='([^']+)'/u.exec(script ?? '');
    expect(match?.[1]).toBeDefined();

    return match![1]!;
  }

  function turboDryRun(filter: string): {
    packages: string[];
    tasks: string[];
  } {
    const stdout = execFileSync(
      path.join(repoRoot, 'node_modules', '.bin', 'turbo'),
      ['run', 'build', `--filter=${filter}`, '--dry=json'],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    const summary = JSON.parse(stdout) as {
      packages?: string[];
      tasks?: { taskId: string }[];
    };

    return {
      packages: summary.packages ?? [],
      tasks: (summary.tasks ?? []).map((task) => task.taskId),
    };
  }

  function workspaceDependencies(): string[] {
    const manifest = JSON.parse(readAppFile('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    })
      .filter(([, range]) => range.startsWith('workspace:'))
      .map(([name]) => name);
  }

  // turboDryRun shells out to the turbo binary over the whole monorepo graph:
  // 466ms locally, over the 5s default on CI runners under cache contention
  // (run 37933799586). Timeout bumps preserve all assertions.
  it(
    'selects every workspace dependency of the app',
    { timeout: 20_000 },
    () => {
      const { packages } = turboDryRun(postInstallFilter());

      expect(packages.length).toBeGreaterThan(0);
      expect(packages).toEqual(expect.arrayContaining(workspaceDependencies()));
    },
  );

  it(
    'builds brand-assets, whose missing dist broke Metro on EAS',
    { timeout: 20_000 },
    () => {
      expect(turboDryRun(postInstallFilter()).tasks).toContain(
        '@zapengine/brand-assets#build',
      );
    },
  );

  it(
    'excludes the app itself so the hook cannot re-enter the app bundle',
    { timeout: 20_000 },
    () => {
      const { packages, tasks } = turboDryRun(postInstallFilter());

      expect(packages).not.toContain('@zapengine/app');
      expect(tasks).not.toContain('@zapengine/app#build');
    },
  );
});
