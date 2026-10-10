import { generateKeyPairSync } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runScriptWithEasStub } from './support/easCliStub';
import { prepareArchiveAppVersion } from '../scripts/ios-release.mjs';

const realAppRoot = fileURLToPath(new URL('..', import.meta.url));
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

interface Asc {
  versions?: { version: string; state: string }[];
  trains?: string[];
  status?: number;
}

const approved = (version: string) => ({
  version,
  state: 'READY_FOR_DISTRIBUTION',
});

/** A throwaway app root: real scripts and config, nothing shared with the repo. */
function makeAppRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'ios-release-'));
  cpSync(path.join(realAppRoot, 'scripts'), path.join(root, 'scripts'), {
    recursive: true,
  });
  for (const file of ['app.config.ts', 'eas.json', 'release-baselines.json']) {
    cpSync(path.join(realAppRoot, file), path.join(root, file));
  }
  const keyPath = path.join(root, 'AuthKey.p8');
  writeFileSync(keyPath, pem);
  const preload = path.join(root, 'preload.mjs');
  writeFileSync(
    preload,
    `const fixture = JSON.parse(process.env.ASC_FIXTURE ?? '{}');
globalThis.fetch = async (url) => {
  if (fixture.status && fixture.status !== 200) {
    return new Response(JSON.stringify({ errors: [{ code: 'E', title: 'T' }] }), { status: fixture.status });
  }
  const rows = String(url).includes('/appStoreVersions')
    ? (fixture.versions ?? []).map((v) => ({ attributes: { platform: 'IOS', versionString: v.version, appVersionState: v.state } }))
    : (fixture.trains ?? []).map((v) => ({ attributes: { platform: 'IOS', version: v } }));
  return new Response(JSON.stringify({ data: rows }), { status: 200 });
};
`,
  );

  return {
    root,
    keyPath,
    preload,
    config: path.join(root, 'app.config.ts'),
    script: path.join(root, 'scripts', 'ios-release.mjs'),
  };
}

function run(
  app: ReturnType<typeof makeAppRoot>,
  args: string[],
  {
    asc = {},
    env = {},
  }: { asc?: Asc; env?: Record<string, string | undefined> } = {},
) {
  const out = path.join(app.root, 'github_output');
  const summary = path.join(app.root, 'summary.md');
  writeFileSync(out, '');
  writeFileSync(summary, '');

  const result = runScriptWithEasStub(
    app.script,
    args,
    {
      CI: 'true',
      APPLE_API_KEY: app.keyPath,
      APPLE_API_KEY_ID: 'KEYID123',
      APPLE_API_ISSUER: 'issuer',
      ASC_FIXTURE: JSON.stringify(asc),
      EAS_STUB_APP_CONFIG: app.config,
      EAS_BUILD_VERSION_JSON: JSON.stringify({ buildNumber: '223' }),
      EAS_BUILD_JSON: JSON.stringify([
        {
          id: 'build-1',
          status: 'FINISHED',
          appVersion: '__VERSION__',
          appBuildVersion: '224',
        },
      ]),
      GITHUB_OUTPUT: out,
      GITHUB_STEP_SUMMARY: summary,
      ...env,
    },
    { nodeArgs: ['--import', app.preload] },
  );

  return {
    ...result,
    output: readFileSync(out, 'utf8'),
    summary: readFileSync(summary, 'utf8'),
  };
}

const original = readFileSync(path.join(realAppRoot, 'app.config.ts'), 'utf8');
const closed = { versions: [approved('3.0.1')], trains: ['3.0.1'] };

describe('ios-release resolve', () => {
  it('is read-only: only reads the remote build number and writes nothing', () => {
    const app = makeAppRoot();
    const result = run(app, ['resolve'], { asc: closed });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Resolved App Version: 3.0.2');
    expect(result.stdout).toContain('EAS Remote Build Number: 223');
    expect(result.calls.trim().split('\n')).toHaveLength(1);
    expect(result.calls).toContain('build:version:get');
    expect(readFileSync(app.config, 'utf8')).toBe(original);
    expect(result.output).toBe('');
  });
});

describe('ios-release build', () => {
  it('builds the resolved version, restores the file, and hides ASC env from EAS', () => {
    const app = makeAppRoot();
    const result = run(app, ['build', '--policy', 'auto'], { asc: closed });

    expect(result.status).toBe(0);
    expect(result.calls).toContain('config --platform ios');
    expect(result.calls).toContain(
      '--message App Version 3.0.2 (ios_version_policy=auto)',
    );
    expect(result.appleEnvCounts.every((count) => count === 0)).toBe(true);
    expect(readFileSync(app.config, 'utf8')).toBe(original);
    expect(result.output).toBe(
      'build_id=build-1\napp_version=3.0.2\nbuild_number=224\n',
    );
    expect(result.summary).toContain('| Resolved App Version | 3.0.2 |');
  });

  it('does not touch the file when the committed version is already right', () => {
    const app = makeAppRoot();
    const result = run(app, ['build'], { asc: { versions: [], trains: [] } });

    expect(result.status).toBe(0);
    expect(result.output).toContain('app_version=3.0.1');
  });

  it.each([
    [
      'keep against a closed version',
      ['build', '--policy', 'keep'],
      { asc: closed },
      /auto or bump-patch/u,
    ],
    [
      'missing credentials',
      ['build'],
      { asc: closed, env: { APPLE_API_ISSUER: '' } },
      /APPLE_API_ISSUER/u,
    ],
    [
      'Apple unavailable',
      ['build'],
      { asc: { status: 500 } },
      /temporarily unable/u,
    ],
    [
      'remote below the floor',
      ['build'],
      { asc: closed, env: { EAS_BUILD_VERSION_JSON: '{"buildNumber":"203"}' } },
      /below App Store Connect floor 204/u,
    ],
    [
      'uninitialised remote',
      ['build'],
      { asc: closed, env: { EAS_BUILD_VERSION_JSON: '{}' } },
      /not initialized[\s\S]*ios:version:init/u,
    ],
  ])('fails before any EAS build on %s', (_name, args, options, pattern) => {
    const app = makeAppRoot();
    const result = run(app, args, options as Parameters<typeof run>[2]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(pattern);
    expect(result.calls).not.toContain('build --platform');
    expect(readFileSync(app.config, 'utf8')).toBe(original);
    expect(result.output).toBe('');
  });

  it('passes the floor check at and above the floor', () => {
    for (const number of ['204', '227']) {
      const app = makeAppRoot();
      const result = run(app, ['resolve'], {
        asc: closed,
        env: {
          EAS_BUILD_VERSION_JSON: JSON.stringify({ buildNumber: number }),
        },
      });

      expect(result.status).toBe(0);
    }
  });

  it('fails before building when eas config disagrees, with the file restored', () => {
    const app = makeAppRoot();
    const result = run(app, ['build'], {
      asc: closed,
      env: { EAS_CONFIG_EXTRA: ',"ios":{"version":"9.9.9"}' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Version synchronization failed');
    expect(result.calls).not.toContain('build --platform');
    expect(readFileSync(app.config, 'utf8')).toBe(original);
  });

  it('restores the file when eas build exits non-zero', () => {
    const app = makeAppRoot();
    const result = run(app, ['build'], {
      asc: closed,
      env: { EAS_BUILD_EXIT: '7' },
    });

    expect(result.status).toBe(7);
    expect(readFileSync(app.config, 'utf8')).toBe(original);
    expect(result.output).toBe('');
  });

  it('does not hand a build with the wrong app version to submit', () => {
    const app = makeAppRoot();
    const result = run(app, ['build'], {
      asc: closed,
      env: {
        EAS_BUILD_JSON: JSON.stringify([
          {
            id: 'b',
            status: 'FINISHED',
            appVersion: '3.0.1',
            appBuildVersion: '224',
          },
        ]),
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Version synchronization failed');
    expect(result.output).toBe('');
    expect(readFileSync(app.config, 'utf8')).toBe(original);
  });

  it('does not hand over a build whose number did not advance', () => {
    const app = makeAppRoot();
    const result = run(app, ['build'], {
      asc: closed,
      env: {
        EAS_BUILD_JSON: JSON.stringify([
          {
            id: 'b',
            status: 'FINISHED',
            appVersion: '__VERSION__',
            appBuildVersion: '223',
          },
        ]),
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('did not advance');
    expect(result.output).toBe('');
  });

  it('keeps a successful build successful when the restore fails', () => {
    const app = makeAppRoot();
    const result = run(app, ['build'], {
      asc: closed,
      env: { EAS_STUB_CHMOD_CONFIG: '1' },
    });

    chmodSync(app.config, 0o644);
    expect(result.status).toBe(0);
    expect(result.output).toContain('build_id=build-1');
    expect(result.stdout + result.stderr).toContain('could not restore');
  });

  it('rejects an unknown policy before any network or EAS call', () => {
    const app = makeAppRoot();
    const result = run(app, ['build', '--policy', 'yolo']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown --policy');
    expect(result.calls).toBe('');
  });
});

describe('prepareArchiveAppVersion', () => {
  it('pins the version, keeps it, and never calls EAS', async () => {
    const app = makeAppRoot();
    const env: Record<string, string | undefined> = {
      APPLE_API_KEY: app.keyPath,
      APPLE_API_KEY_ID: 'KEYID123',
      APPLE_API_ISSUER: 'issuer',
    };
    const fetchImpl = async (url: string) =>
      new Response(
        JSON.stringify({
          data: String(url).includes('/appStoreVersions')
            ? [
                {
                  attributes: {
                    platform: 'IOS',
                    versionString: '3.0.1',
                    appVersionState: 'READY_FOR_DISTRIBUTION',
                  },
                },
              ]
            : [],
        }),
        { status: 200 },
      );

    mkdirSync(path.join(app.root, 'bin'));
    const decision = await prepareArchiveAppVersion({
      appRoot: app.root,
      policy: 'auto',
      env: env as NodeJS.ProcessEnv,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(decision.version).toBe('3.0.2');
    expect(readFileSync(app.config, 'utf8')).toContain("  version: '3.0.2',");
    expect(env.APPLE_API_KEY).toBeUndefined();
  });
});
