import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { SearchIntentProvider } from './search-intents.js';
import {
  parseStoryboardSmokeCliArgs,
  runStoryboardSmokeCli,
} from './smoke-cli.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('storyboard smoke catalog mode', () => {
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
    ) as Array<Record<string, unknown>>;
    expect(scenePlan.length).toBeGreaterThan(0);
    expect(scenePlan[0]).toMatchObject({
      sceneId: 'scene-01',
      visualCue: 'GPU launch keynote',
      subjectIds: ['subject-nvidia'],
    });
    expect(scenePlan[0]?.['cueQuery']).toContain('NVIDIA');
    expect(await readFile(join(outputDirectory, 'catalog.json'), 'utf8')).toContain(
      'sceneCues',
    );
    expect(
      await readFile(join(outputDirectory, 'assignments.json'), 'utf8'),
    ).toContain('selectionReason');
  });
});
