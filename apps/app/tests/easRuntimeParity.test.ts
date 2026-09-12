import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(appRoot, '../..');

interface EasBuildProfile {
  node?: string;
  pnpm?: string;
  corepack?: boolean;
}

interface EasConfig {
  build?: {
    preview?: EasBuildProfile;
    production?: EasBuildProfile;
  };
}

interface RootPackage {
  packageManager?: string;
  engines?: {
    node?: string;
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function readNvmrcMajor(): string {
  const nvmrc = readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8')
    .trim()
    .replace(/^v/u, '');

  return nvmrc.split('.')[0]!;
}

describe('EAS runtime parity', () => {
  const eas = readJson<EasConfig>(path.join(appRoot, 'eas.json'));
  const rootPackage = readJson<RootPackage>(
    path.join(repoRoot, 'package.json'),
  );
  const profiles = ['preview', 'production'] as const;

  it.each(profiles)(
    '%s pins pnpm to the root packageManager without Corepack',
    (profileName) => {
      // EAS runs `npm -g install pnpm@X` for every build regardless of
      // Corepack. Enabling Corepack only adds a shim at $NVM_BIN/pnpm that the
      // later global install collides with, failing the build with EEXIST --
      // see expo/eas-cli#3148 and #3131, both still open. So the profile pin is
      // what selects the pnpm version, and `corepack` must stay off.
      const packageManager = rootPackage.packageManager;
      expect(packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/u);

      expect(eas.build?.[profileName]?.corepack).not.toBe(true);
      expect(eas.build?.[profileName]?.pnpm).toBe(
        packageManager!.replace(/^pnpm@/u, ''),
      );
    },
  );

  it.each(profiles)('%s stays on the repository Node major', (profileName) => {
    const nodeRange = rootPackage.engines?.node;
    expect(nodeRange).toMatch(/^\d+\.x$/u);

    const expectedMajor = nodeRange!.replace(/\.x$/u, '');
    // .nvmrc is what CI (setup-workspace, turbo) actually installs, so the
    // two Node sources must agree and EAS must match them.
    expect(readNvmrcMajor()).toBe(expectedMajor);
    expect(eas.build?.[profileName]?.node).toMatch(
      new RegExp(`^${expectedMajor}\\.\\d+\\.\\d+$`, 'u'),
    );
  });

  it('keeps preview and production on the same build runtime', () => {
    expect(eas.build?.preview?.node).toBe(eas.build?.production?.node);
    expect(eas.build?.preview?.corepack).not.toBe(true);
    expect(eas.build?.production?.corepack).not.toBe(true);
    expect(eas.build?.preview?.pnpm).toBe(eas.build?.production?.pnpm);
  });
});
