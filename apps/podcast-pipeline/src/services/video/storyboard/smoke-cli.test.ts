import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDeterministicStoryboardProvider } from './fallback.js';
import type { SearchIntentProvider } from './search-intents.js';
import {
  parseStoryboardSmokeCliArgs,
  runStoryboardSmokeCli,
} from './smoke-cli.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('storyboard smoke catalog mode', () => {
  it('rejects boolean, valued catalog, missing required, and invalid duration flags', () => {
    expect(() =>
      parseStoryboardSmokeCliArgs([
        '--script',
        '--title',
        'Title',
        '--duration-ms',
        '1000',
        '--output',
        './out',
      ]),
    ).toThrow('Usage: video:storyboard:smoke');
    expect(() =>
      parseStoryboardSmokeCliArgs([
        '--script',
        './episode.txt',
        '--title',
        'Title',
        '--duration-ms',
        '1000',
        '--output',
        './out',
        '--catalog',
        'value',
      ]),
    ).toThrow('--catalog does not accept a value');
    expect(() =>
      parseStoryboardSmokeCliArgs([
        '--script',
        './episode.txt',
        '--title',
        '   ',
        '--duration-ms',
        '1000',
        '--output',
        './out',
      ]),
    ).toThrow('Usage: video:storyboard:smoke');
    expect(() =>
      parseStoryboardSmokeCliArgs([
        '--script',
        './episode.txt',
        '--title',
        'Title',
        '--duration-ms',
        '1.5',
        '--output',
        './out',
      ]),
    ).toThrow('--duration-ms must be a positive integer');
  });

  it('parses catalog and search evidence flags', () => {
    const parsed = parseStoryboardSmokeCliArgs([
      '--script',
      './episode.txt',
      '--title',
      'NVIDIA launch',
      '--duration-ms',
      '24000',
      '--output',
      './smoke-output',
      '--catalog',
      '--search-title',
      'NVIDIA launches a new GPU',
      '--search-script',
      './episode.en.txt',
    ]);

    expect(parsed.catalog).toBe(true);
    expect(parsed.searchTitle).toBe('NVIDIA launches a new GPU');
    expect(parsed.searchScriptPath).toMatch(/episode\.en\.txt$/u);
  });

  it('writes a scene plan from one catalog provider call without image search', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'storyboard-smoke-test-'));
    temporaryDirectories.push(directory);
    const scriptPath = join(directory, 'episode.txt');
    const outputDirectory = join(directory, 'output');
    await writeFile(
      scriptPath,
      'NVIDIA launched a new GPU. The launch happened on a keynote stage. Markets reacted after the announcement.',
      'utf8',
    );

    let catalogCalls = 0;
    const catalogProvider: SearchIntentProvider = {
      model: 'test/catalog',
      catalog: async (request) => {
        catalogCalls += 1;
        return {
          primarySubjectId: 'subject-nvidia',
          subjects: [
            {
              id: 'subject-nvidia',
              canonicalName: 'NVIDIA',
              type: 'company',
              aliases: [],
              storyRole: 'primary',
              evidenceSceneIds: request.scenes
                .filter((scene) => scene.text.includes('NVIDIA'))
                .map((scene) => scene.sceneId),
              searchQueries: ['NVIDIA GPU maker'],
              identityHints: ['GPU maker'],
              negativeHints: [],
              officialDomains: [],
            },
          ],
          sceneCues: request.scenes.map((scene, index) => ({
            sceneId: scene.sceneId,
            subjectId: 'subject-nvidia',
            visualCue:
              index === 0 ? 'GPU launch keynote' : 'stock chart reaction',
          })),
        };
      },
    };

    await runStoryboardSmokeCli(
      [
        '--script',
        scriptPath,
        '--title',
        'NVIDIA launch',
        '--duration-ms',
        '24000',
        '--output',
        outputDirectory,
        '--catalog',
      ],
      { catalog: catalogProvider },
    );

    expect(catalogCalls).toBe(1);
    const scenePlan = JSON.parse(
      await readFile(join(outputDirectory, 'scene-plan.json'), 'utf8'),
    ) as Record<string, unknown>[];
    expect(scenePlan.length).toBeGreaterThan(0);
    expect(scenePlan[0]).toMatchObject({
      sceneId: 'scene-01',
      visualCue: 'GPU launch keynote',
      subjectIds: ['subject-nvidia'],
    });
    expect(scenePlan[0]?.['cueQuery']).toContain('NVIDIA');
    expect(
      await readFile(join(outputDirectory, 'catalog.json'), 'utf8'),
    ).toContain('sceneCues');
    expect(
      await readFile(join(outputDirectory, 'assignments.json'), 'utf8'),
    ).toContain('selectionReason');
  });

  it('runs the deterministic storyboard path without catalog enrichment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'storyboard-smoke-basic-'));
    temporaryDirectories.push(directory);
    const scriptPath = join(directory, 'episode.txt');
    const outputDirectory = join(directory, 'output');
    await writeFile(scriptPath, 'One sentence. Another sentence.', 'utf8');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runStoryboardSmokeCli([
      '--script',
      scriptPath,
      '--title',
      'Simple smoke',
      '--duration-ms',
      '12000',
      '--output',
      outputDirectory,
    ]);

    expect(
      await readFile(join(outputDirectory, 'draft.json'), 'utf8'),
    ).toContain('scene-01');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Storyboard smoke complete'),
    );
    log.mockRestore();
  });

  it('accepts a direct storyboard provider override', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'storyboard-smoke-provider-'),
    );
    temporaryDirectories.push(directory);
    const scriptPath = join(directory, 'episode.txt');
    const outputDirectory = join(directory, 'output');
    await writeFile(scriptPath, 'One sentence. Another sentence.', 'utf8');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runStoryboardSmokeCli(
      [
        '--script',
        scriptPath,
        '--title',
        'Provider smoke',
        '--duration-ms',
        '12000',
        '--output',
        outputDirectory,
      ],
      createDeterministicStoryboardProvider(),
    );

    expect(log).toHaveBeenCalledWith(expect.stringContaining('deterministic'));
    log.mockRestore();
  });

  it('reads alternate English evidence and reports a degraded catalog', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'storyboard-smoke-degraded-'),
    );
    temporaryDirectories.push(directory);
    const scriptPath = join(directory, 'episode.txt');
    const searchScriptPath = join(directory, 'episode.en.txt');
    const outputDirectory = join(directory, 'output');
    await writeFile(
      scriptPath,
      'AI changed markets. Investors reacted.',
      'utf8',
    );
    await writeFile(
      searchScriptPath,
      'AI changed markets. Investors reacted.',
      'utf8',
    );

    const catalogProvider: SearchIntentProvider = {
      model: 'test/catalog',
      catalog: async () => ({
        primarySubjectId: 'subject-ai',
        subjects: [
          {
            id: 'subject-ai',
            canonicalName: 'AI',
            type: 'other',
            aliases: [],
            storyRole: 'primary',
            evidenceSceneIds: ['scene-01'],
            searchQueries: ['AI'],
            identityHints: [],
            negativeHints: [],
            officialDomains: [],
          },
        ],
      }),
    };

    await expect(
      runStoryboardSmokeCli(
        [
          '--script',
          scriptPath,
          '--title',
          'AI story',
          '--duration-ms',
          '12000',
          '--output',
          outputDirectory,
          '--catalog',
          '--search-title',
          'English AI story',
          '--search-script',
          searchScriptPath,
        ],
        { catalog: catalogProvider },
      ),
    ).rejects.toThrow();
  });
});
