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

function readVercelConfig(): VercelConfig {
  return JSON.parse(
    readFileSync(resolve(repoRoot, 'apps/control-center/vercel.json'), 'utf8'),
  ) as VercelConfig;
}

describe('control-center launch contract', () => {
  it('preserves server-side Infisical credentials through Turbo', () => {
    const command = readRootScripts()['ops:dashboard'];

    expect(command).toContain('turbo run dev');
    expect(command).toContain('--filter=@zapengine/control-center');
    expect(command).toContain('--env-mode=loose');
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
});
