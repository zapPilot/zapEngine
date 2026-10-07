import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryDirectories: string[] = [];

async function smokePaths(prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  const scriptPath = join(directory, 'episode.txt');
  const outputDirectory = join(directory, 'output');
  await writeFile(
    scriptPath,
    'NVIDIA launched a GPU. Markets reacted.',
    'utf8',
  );
  return { scriptPath, outputDirectory };
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('./search-intents.js');
  vi.doUnmock('../podcast-visual-assets.js');
  vi.doUnmock('../../../lib/is-main-module.js');
  vi.doUnmock('../../../lib/cli-runner.js');
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('storyboard smoke CLI coverage edges', () => {
  it('uses the default catalog provider and serializes absent assignment metadata', async () => {
    const { scriptPath, outputDirectory } = await smokePaths(
      'storyboard-smoke-default-catalog-',
    );
    const defaultProvider = {
      model: 'test/default-provider',
      catalog: vi.fn(),
    };

    defaultProvider.catalog.mockResolvedValue({
      primarySubjectId: 'subject-nvidia',
      subjects: [
        {
          id: 'subject-nvidia',
          canonicalName: 'NVIDIA',
          type: 'company',
          aliases: [],
          storyRole: 'primary',
          evidenceSceneIds: ['scene-01'],
          identityHints: ['GPU maker'],
          negativeHints: [],
          searchQualifier: null,
        },
      ],
    });
    vi.doMock('./search-intents.js', async (importOriginal) => ({
      ...(await importOriginal<typeof import('./search-intents.js')>()),
      createOpenRouterSearchIntentProvider: () => defaultProvider,
    }));

    const { runStoryboardSmokeCli } = await import('./smoke-cli.js');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runStoryboardSmokeCli([
      '--script',
      scriptPath,
      '--title',
      'NVIDIA story',
      '--duration-ms',
      '12000',
      '--output',
      outputDirectory,
      '--catalog',
    ]);

    const scenePlan = JSON.parse(
      await readFile(join(outputDirectory, 'scene-plan.json'), 'utf8'),
    ) as Record<string, unknown>[];
    expect(scenePlan[0]).toMatchObject({
      selectionReason: 'direct',
      subjectIds: ['subject-nvidia'],
      visualCue: null,
    });
  });

  it('uses the generic catalog failure message when degradation has no reason', async () => {
    const { scriptPath, outputDirectory } = await smokePaths(
      'storyboard-smoke-no-reason-',
    );

    const { SubjectCatalogUnavailableError } =
      await import('./search-intents.js');
    const failure = new SubjectCatalogUnavailableError([
      { attempt: 1, issues: ['invalid'] },
      { attempt: 2, issues: ['invalid'] },
      { attempt: 3, issues: ['invalid'] },
    ]);
    vi.doMock('./search-intents.js', () => ({
      createOpenRouterSearchIntentProvider: () => ({ model: 'test/default' }),
      enrichStoryboardSearchIntents: async () => {
        throw failure;
      },
    }));

    const { runStoryboardSmokeCli } = await import('./smoke-cli.js');
    await expect(
      runStoryboardSmokeCli([
        '--script',
        scriptPath,
        '--title',
        'NVIDIA story',
        '--duration-ms',
        '12000',
        '--output',
        outputDirectory,
        '--catalog',
      ]),
    ).rejects.toBe(failure);
  });

  it('runs the main-module callback through runCli', async () => {
    const { scriptPath, outputDirectory } = await smokePaths(
      'storyboard-smoke-main-',
    );
    let callback: (() => Promise<void>) | undefined;
    const originalArgv = process.argv;
    process.argv = [
      'node',
      'smoke-cli',
      '--script',
      scriptPath,
      '--title',
      'Main module smoke',
      '--duration-ms',
      '12000',
      '--output',
      outputDirectory,
    ];

    vi.doMock('../../../lib/is-main-module.js', () => ({
      isMainModule: () => true,
    }));
    vi.doMock('../../../lib/cli-runner.js', () => ({
      runCli: (runner: () => Promise<void>) => {
        callback = runner;
      },
    }));

    try {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await import('./smoke-cli.js');
      expect(callback).toBeTypeOf('function');
      await callback?.();
      expect(
        await readFile(join(outputDirectory, 'draft.json'), 'utf8'),
      ).toContain('scene-01');
    } finally {
      process.argv = originalArgv;
    }
  });
});
