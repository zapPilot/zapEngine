import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface PackageManifest {
  scripts?: Record<string, string>;
}

interface VercelConfig {
  rewrites?: Array<{ source: string; destination: string }>;
}

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

function readRootScripts(): Record<string, string> {
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
  ) as PackageManifest;
  return manifest.scripts ?? {};
}

function readOpsLauncher(): string {
  return readFileSync(resolve(repoRoot, 'scripts/ops.mjs'), 'utf8');
}

function readVercelConfig(): VercelConfig {
  return JSON.parse(
    readFileSync(resolve(repoRoot, 'apps/control-center/vercel.json'), 'utf8'),
  ) as VercelConfig;
}

describe('control-center launch contract', () => {
  it('loads local secrets before direct dashboard startup', () => {
    const scripts = readRootScripts();
    const command = scripts['ops:dashboard'];
    const rawCommand = scripts['ops:dashboard:raw'];

    expect(command).toContain('node scripts/env/run.mjs');
    expect(command).toContain('pnpm run ops:dashboard:raw');
    expect(rawCommand).toContain('turbo run dev');
    expect(rawCommand).toContain('--filter=@zapengine/control-center');
    expect(rawCommand).toContain('--env-mode=loose');
  });

  it('reuses the injected env when the full ops stack starts the dashboard', () => {
    expect(readOpsLauncher()).toContain("args: ['run', 'ops:dashboard:raw']");
  });

  it('routes every nested Vercel API path through the Hono entrypoint', () => {
    expect(readVercelConfig().rewrites).toContainEqual({
      source: '/api/:path*',
      destination: '/api/index',
    });
    expect(
      existsSync(resolve(repoRoot, 'apps/control-center/api/index.ts')),
    ).toBe(true);
  });

  // Vercel's Hobby-tier Standard Protection does not cover a production custom
  // domain, so nothing in front of this entrypoint authenticates the operator.
  // The guard has to come from the entrypoint itself, and its absence has to
  // fail the boot rather than serve the surface anonymously.
  it('refuses to boot the remote entrypoint without operator credentials', () => {
    const entrypoint = readFileSync(
      resolve(repoRoot, 'apps/control-center/api/index.ts'),
      'utf8',
    );

    expect(entrypoint).toContain('requireControlCenterAuth');
    expect(entrypoint).toMatch(/auth:\s*requireControlCenterAuth\(/);
  });
});
