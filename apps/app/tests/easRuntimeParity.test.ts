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

describe('EAS runtime parity', () => {
  const eas = readJson<EasConfig>(path.join(appRoot, 'eas.json'));
  const rootPackage = readJson<RootPackage>(path.join(repoRoot, 'package.json'));
  const profiles = ['preview', 'production'] as const;

  it.each(profiles)('%s uses the repository pnpm version', (profileName) => {
    const packageManager = rootPackage.packageManager;
    expect(packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/u);

    const expectedPnpm = packageManager!.replace(/^pnpm@/u, '');
    expect(eas.build?.[profileName]?.pnpm).toBe(expectedPnpm);
    expect(eas.build?.[profileName]?.corepack).toBe(true);
  });

  it.each(profiles)('%s stays on the repository Node major', (profileName) => {
    const nodeRange = rootPackage.engines?.node;
    expect(nodeRange).toMatch(/^\d+\.x$/u);

    const expectedMajor = nodeRange!.replace(/\.x$/u, '');
    expect(eas.build?.[profileName]?.node).toMatch(
      new RegExp(`^${expectedMajor}\\.\\d+\\.\\d+$`, 'u'),
    );
  });

  it('keeps preview and production on the same build runtime', () => {
    expect(eas.build?.preview).toMatchObject({
      node: eas.build?.production?.node,
      pnpm: eas.build?.production?.pnpm,
      corepack: true,
    });
  });
});
