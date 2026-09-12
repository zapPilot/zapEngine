import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(appRoot, '../..');

interface PackageManifest {
  name?: string;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function readManifest(filePath: string): PackageManifest {
  return JSON.parse(readFileSync(filePath, 'utf8')) as PackageManifest;
}

function postInstallFilter(): string {
  const script = readManifest(path.join(appRoot, 'package.json')).scripts?.[
    'eas-build-post-install'
  ];
  const match = /--filter='([^']+)'/u.exec(script ?? '');

  expect(match?.[1]).toBeDefined();
  return match![1]!;
}

function selectedBuildTasks(): string[] {
  const stdout = execFileSync(
    path.join(repoRoot, 'node_modules', '.bin', 'turbo'),
    ['run', 'build', `--filter=${postInstallFilter()}`, '--dry=json'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const summary = JSON.parse(stdout) as { tasks?: { taskId: string }[] };

  return (summary.tasks ?? []).map((task) => task.taskId);
}

function runtimeWorkspaceDependenciesWithBuild(): string[] {
  const appManifest = readManifest(path.join(appRoot, 'package.json'));
  const manifests = globSync('packages/*/package.json', { cwd: repoRoot }).map(
    (relativePath) => readManifest(path.join(repoRoot, relativePath)),
  );
  const manifestsByName = new Map(
    manifests.flatMap((manifest) =>
      manifest.name ? [[manifest.name, manifest] as const] : [],
    ),
  );

  return Object.entries(appManifest.dependencies ?? {})
    .filter(([, range]) => range.startsWith('workspace:'))
    .map(([name]) => {
      const manifest = manifestsByName.get(name);
      expect(
        manifest,
        `workspace dependency ${name} must have a manifest`,
      ).toBeDefined();
      return manifest!;
    })
    .filter((manifest) => Boolean(manifest.scripts?.build))
    .map((manifest) => manifest.name!);
}

describe('EAS post-install workspace build coverage', () => {
  it('schedules build tasks for every buildable runtime workspace dependency', () => {
    const expectedTasks = runtimeWorkspaceDependenciesWithBuild().map(
      (name) => `${name}#build`,
    );

    expect(expectedTasks.length).toBeGreaterThan(1);
    expect(selectedBuildTasks()).toEqual(expect.arrayContaining(expectedTasks));
  });
});
