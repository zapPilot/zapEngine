import { describe, expect, it } from 'vitest';

import * as model from '../scripts/ios-app-version.mjs';

const { bumpPatch, compareVersions, parseVersion } = model;
const resolve = model.resolveIosAppVersion as (input: {
  policy: string;
  committed: string;
  storeVersions?: { version: string; state: string }[];
  trainVersions?: string[];
}) => {
  version: string;
  current: string;
  closed: boolean;
  warnings: string[];
};

const approved = (version: string) => ({
  version,
  state: 'READY_FOR_DISTRIBUTION',
});
const open = (version: string, state = 'PREPARE_FOR_SUBMISSION') => ({
  version,
  state,
});

function auto(
  storeVersions: { version: string; state: string }[],
  trainVersions: string[] = [],
  committed = '3.0.1',
) {
  return resolve({ policy: 'auto', committed, storeVersions, trainVersions });
}

describe('version parsing', () => {
  it('pads missing segments and reads leading zeros as numbers', () => {
    expect(parseVersion('2.03')).toEqual([2, 3, 0]);
    expect(compareVersions('3.0', '3.0.0')).toBe(0);
    expect(compareVersions('2.03', '2.3')).toBe(0);
    expect(compareVersions('3.0.10', '3.0.9')).toBeGreaterThan(0);
  });

  it.each(['3.0.1-beta', 'v3', '1.2.3.4', '', 'x'])('rejects %s', (bad) => {
    expect(() => parseVersion(bad)).toThrow(/Unsupported app version/u);
  });

  it('bumps the patch segment numerically', () => {
    expect(bumpPatch('3.0.9')).toBe('3.0.10');
    expect(bumpPatch('3.1')).toBe('3.1.1');
  });
});

describe('open-state allowlist', () => {
  it('treats every non-allowlisted state as closed and warns on unknown ones', () => {
    const result = auto([open('3.0.2', 'SOMETHING_NEW')]);

    expect(result.closed).toBe(true);
    expect(result.version).toBe('3.0.3');
    expect(result.warnings.join()).toContain('SOMETHING_NEW');
  });

  it.each([
    'PREPARE_FOR_SUBMISSION',
    'READY_FOR_REVIEW',
    'WAITING_FOR_REVIEW',
    'IN_REVIEW',
    'DEVELOPER_REJECTED',
    'REJECTED',
    'METADATA_REJECTED',
    'INVALID_BINARY',
  ])('keeps %s open', (state) => {
    expect(auto([open('3.0.2', state)]).version).toBe('3.0.2');
  });
});

describe('auto policy', () => {
  it('uses the committed version when Apple has no records', () => {
    expect(auto([]).version).toBe('3.0.1');
  });

  it('moves past an approved version', () => {
    expect(auto([approved('3.0.1')]).version).toBe('3.0.2');
  });

  it('moves past a run of approved versions', () => {
    expect(
      auto([approved('3.0.1'), approved('3.0.2'), approved('3.0.3')]).version,
    ).toBe('3.0.4');
    expect(auto([approved('3.0.9')], [], '3.0.1').version).toBe('3.0.10');
  });

  it('reuses an unapproved TestFlight train without bumping again', () => {
    expect(auto([approved('3.0.1')], ['3.0.1', '3.0.2']).version).toBe('3.0.2');
  });

  it('uses a newer open version already created in App Store Connect', () => {
    expect(auto([approved('3.0.1'), open('3.1.0')], ['3.0.1']).version).toBe(
      '3.1.0',
    );
  });

  it('honours a committed floor raised above everything Apple knows', () => {
    expect(auto([approved('3.0.1')], ['3.0.1'], '3.1.0').version).toBe('3.1.0');
  });

  it('warns when the resolved version is in review', () => {
    const result = auto([open('3.0.2', 'IN_REVIEW')]);

    expect(result.version).toBe('3.0.2');
    expect(result.warnings.join()).toContain('ITMS-90186');
  });

  it('keeps the spelling Apple uses for an equal numeric version', () => {
    const result = auto([open('3.1')], [], '3.1.0');

    expect(result.current).toBe('3.1');
    expect(result.version).toBe('3.1');
  });

  it('fails closed on an unparseable Apple version', () => {
    expect(() => auto([approved('3.0.1-beta')])).toThrow(/Unsupported/u);
  });
});

describe('keep policy', () => {
  const keep = (
    store: { version: string; state: string }[],
    train: string[] = [],
  ) =>
    resolve({
      policy: 'keep',
      committed: '3.0.1',
      storeVersions: store,
      trainVersions: train,
    });

  it('builds the current version while it is open', () => {
    expect(keep([open('3.0.2')]).version).toBe('3.0.2');
  });

  it('fails with an actionable message when Apple closed it', () => {
    expect(() => keep([approved('3.0.1')])).toThrow(/auto or bump-patch/u);
  });

  it('follows a newer remote version instead of the committed one', () => {
    expect(keep([approved('3.0.1')], ['3.0.2']).version).toBe('3.0.2');
  });
});

describe('bump-patch policy', () => {
  const bump = (store: { version: string; state: string }[]) =>
    resolve({
      policy: 'bump-patch',
      committed: '3.0.1',
      storeVersions: store,
      trainVersions: [],
    }).version;

  it('always advances, open or closed', () => {
    expect(bump([open('3.0.2')])).toBe('3.0.3');
    expect(bump([approved('3.0.1')])).toBe('3.0.2');
  });
});

describe('re-running a release', () => {
  it('rejects an unknown policy', () => {
    expect(() => resolve({ policy: 'nope', committed: '3.0.1' })).toThrow(
      /Unknown ios_version_policy/u,
    );
  });

  it('gives every policy the same answer after a failed build (Apple state unchanged)', () => {
    const state = [approved('3.0.1')];
    const run = (policy: string) =>
      resolve({
        policy,
        committed: '3.0.1',
        storeVersions: state,
        trainVersions: ['3.0.1'],
      });

    expect(run('auto').version).toBe('3.0.2');
    expect(run('auto').version).toBe(run('bump-patch').version);
    expect(() => run('keep')).toThrow();
  });

  it('keeps auto and keep on the same version once the train exists', () => {
    const state = [approved('3.0.1')];
    const trains = ['3.0.1', '3.0.2'];
    const run = (policy: string) =>
      resolve({
        policy,
        committed: '3.0.1',
        storeVersions: state,
        trainVersions: trains,
      }).version;

    expect(run('auto')).toBe('3.0.2');
    expect(run('keep')).toBe('3.0.2');
  });
});

describe('app.config.ts pin helpers', () => {
  const source = `const config = {\n  name: 'x',\n  version: '3.0.1',\n  nested: {\n    version: '9.9.9',\n  },\n};\n`;

  it('rewrites exactly one line and leaves the rest byte-identical', () => {
    const pinned = model.pinCommittedAppVersion(source, '3.0.2') as string;

    expect(model.readCommittedAppVersion(pinned)).toBe('3.0.2');
    expect(pinned.replace("version: '3.0.2'", "version: '3.0.1'")).toBe(source);
  });

  it('refuses zero or multiple matches', () => {
    expect(() => model.readCommittedAppVersion('nothing')).toThrow(/found 0/u);
    expect(() =>
      model.pinCommittedAppVersion(`${source}  version: '1.0.0',\n`, '3.0.2'),
    ).toThrow(/found 2/u);
  });

  it('refuses injected version strings', () => {
    expect(() => model.pinCommittedAppVersion(source, "3.0.2', x: '")).toThrow(
      /Unsupported/u,
    );
  });
});
