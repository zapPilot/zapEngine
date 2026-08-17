import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface PackageManifest {
  scripts?: Record<string, string>;
}

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

describe('social command manifest contract', () => {
  it('exposes only the unified login command at both manifest layers', () => {
    const rootScripts =
      readManifest(resolve(repoRoot, 'package.json')).scripts ?? {};
    const workspaceScripts =
      readManifest(resolve(repoRoot, 'apps/podcast-pipeline/package.json'))
        .scripts ?? {};

    expect(rootScripts['social:login']).toBe(
      'pnpm --filter @zapengine/podcast-pipeline social:login',
    );
    expect(workspaceScripts['social:login']).toBe('tsx src/social/login.ts');
    expect(rootScripts).not.toHaveProperty('social:rednote-login');
    expect(workspaceScripts).not.toHaveProperty('social:rednote-login');
  });

  it('keeps metrics internal while exposing the daemon as the root entry command', () => {
    const rootScripts =
      readManifest(resolve(repoRoot, 'package.json')).scripts ?? {};
    const workspaceScripts =
      readManifest(resolve(repoRoot, 'apps/podcast-pipeline/package.json'))
        .scripts ?? {};

    expect(rootScripts['social:daemon']).toBe(
      'pnpm --filter @zapengine/podcast-pipeline social:daemon',
    );
    expect(rootScripts).not.toHaveProperty('social:metrics');
    expect(workspaceScripts['social:metrics']).toBe(
      'tsx src/social/metrics.ts',
    );
  });
});
