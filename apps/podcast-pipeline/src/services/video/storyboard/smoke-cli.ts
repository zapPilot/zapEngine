import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assertOnlyKnownFlags, parseFlagArgs } from '../../../lib/cli-args.js';
import { runCli } from '../../../lib/cli-runner.js';
import { isMainModule } from '../../../lib/is-main-module.js';
import { podcastBrandVisualKind } from '../../podcast-packaging.js';
import {
  deriveSearchSubjects,
  plannedPrimarySubjects,
  poolSubjectKey,
} from '../episode-image-pool.js';
import { anchoredPlannerScenes } from '../podcast-visual-assets.js';
import type { VisualAssetScene } from '../visual-asset-planner.js';
import { createDeterministicStoryboardProvider } from './fallback.js';
import { generateStoryboard } from './orchestrator.js';
import type { StoryboardProvider } from './provider.js';
import {
  createOpenRouterSearchIntentProvider,
  enrichStoryboardSearchIntents,
  type SearchIntentProvider,
} from './search-intents.js';
import { splitCanonicalSentences } from './sentences.js';

export interface StoryboardSmokeCliOptions {
  scriptPath: string;
  title: string;
  durationMs: number;
  outputDirectory: string;
  catalog: boolean;
  searchTitle?: string;
  searchScriptPath?: string;
}

export interface StoryboardSmokeCliProviders {
  storyboard?: StoryboardProvider;
  catalog?: SearchIntentProvider;
}

const USAGE =
  'Usage: video:storyboard:smoke --script <canonical-script.txt> --title <title> --duration-ms <milliseconds> --output <directory> [--catalog] [--search-title <title>] [--search-script <english-script.txt>]';

export function parseStoryboardSmokeCliArgs(
  argv: string[],
): StoryboardSmokeCliOptions {
  const parsed = parseFlagArgs(['video:storyboard:smoke', ...argv]);
  assertOnlyKnownFlags(
    parsed,
    [
      'script',
      'title',
      'duration-ms',
      'output',
      'catalog',
      'search-title',
      'search-script',
    ],
    USAGE,
  );

  const scriptFlag = parsed.flags['script'];
  const titleFlag = parsed.flags['title'];
  const durationFlag = parsed.flags['duration-ms'];
  const outputFlag = parsed.flags['output'];
  const catalogFlag = parsed.flags['catalog'];
  const searchTitleFlag = parsed.flags['search-title'];
  const searchScriptFlag = parsed.flags['search-script'];
  if (
    typeof scriptFlag === 'boolean' ||
    typeof titleFlag === 'boolean' ||
    typeof durationFlag === 'boolean' ||
    typeof outputFlag === 'boolean' ||
    typeof searchTitleFlag === 'boolean' ||
    typeof searchScriptFlag === 'boolean'
  ) {
    throw new Error(USAGE);
  }
  if (catalogFlag !== undefined && catalogFlag !== true) {
    throw new Error('--catalog does not accept a value');
  }

  const scriptPath = scriptFlag;
  const title = titleFlag?.trim();
  const durationRaw = durationFlag;
  const outputDirectory = outputFlag;
  if (!scriptPath || !title || !durationRaw || !outputDirectory) {
    throw new Error(USAGE);
  }
  const durationMs = Number(durationRaw);
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new Error('--duration-ms must be a positive integer');
  }

  return {
    scriptPath: resolve(scriptPath),
    title,
    durationMs,
    outputDirectory: resolve(outputDirectory),
    catalog: catalogFlag === true,
    ...(searchTitleFlag?.trim() ? { searchTitle: searchTitleFlag.trim() } : {}),
    ...(searchScriptFlag
      ? { searchScriptPath: resolve(searchScriptFlag) }
      : {}),
  };
}

function estimatedTokens(value: string): number {
  return Math.max(1, Math.ceil(Array.from(value).length / 2));
}

export async function runStoryboardSmokeCli(
  argv: string[],
  providerOverride?: StoryboardProvider | StoryboardSmokeCliProviders,
): Promise<void> {
  const options = parseStoryboardSmokeCliArgs(argv);
  const script = await readFile(options.scriptPath, 'utf8');
  const providers: StoryboardSmokeCliProviders =
    providerOverride && 'generate' in providerOverride
      ? { storyboard: providerOverride }
      : (providerOverride ?? {});
  const provider =
    providers.storyboard ?? createDeterministicStoryboardProvider();
  const result = await generateStoryboard({
    title: options.title,
    script,
    durationMs: options.durationMs,
    provider,
  });
  const sentences = splitCanonicalSentences(script);
  const draftJson = `${JSON.stringify(result.draft, null, 2)}\n`;

  await mkdir(options.outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(options.outputDirectory, 'draft.json'),
      draftJson,
      'utf8',
    ),
    writeFile(
      resolve(options.outputDirectory, 'validation-report.json'),
      `${JSON.stringify(
        {
          requestedProvider: result.requestedProvider,
          effectiveProvider: result.effectiveProvider,
          model: result.model,
          usedFallback: result.usedFallback,
          sentenceCount: sentences.length,
          sceneCount: result.draft.scenes.length,
          attempts: result.attempts,
        },
        null,
        2,
      )}\n`,
      'utf8',
    ),
    writeFile(
      resolve(options.outputDirectory, 'token-usage.json'),
      `${JSON.stringify(
        {
          reported: result.totalUsage,
          estimatedInputTokens: estimatedTokens(`${options.title}\n${script}`),
          estimatedOutputTokens: estimatedTokens(draftJson),
        },
        null,
        2,
      )}\n`,
      'utf8',
    ),
    writeFile(
      resolve(options.outputDirectory, 'sentences.json'),
      `${JSON.stringify(sentences, null, 2)}\n`,
      'utf8',
    ),
  ]);

  if (options.catalog) {
    const searchScript = options.searchScriptPath
      ? await readFile(options.searchScriptPath, 'utf8')
      : undefined;
    const enrichment = await enrichStoryboardSearchIntents(
      {
        draft: result.draft,
        title: options.title,
        ...(options.searchTitle ? { searchTitle: options.searchTitle } : {}),
        script,
        ...(searchScript ? { searchScript } : {}),
      },
      {
        provider: providers.catalog ?? createOpenRouterSearchIntentProvider(),
      },
    );
    if (!enrichment.subjectCatalog) {
      throw new Error(
        enrichment.degradedReason ??
          'Catalog smoke produced no subject catalog',
      );
    }
    const contentScenes = enrichment.draft.scenes.filter(
      (scene) => podcastBrandVisualKind(scene.imageSearchIntent) === null,
    ) as VisualAssetScene[];
    const plannerScenes = anchoredPlannerScenes(
      enrichment.subjectCatalog,
      enrichment.sceneAssignments,
      contentScenes,
    );
    const assignments = new Map(
      enrichment.sceneAssignments.map((assignment) => [
        assignment.sceneId,
        assignment,
      ]),
    );
    const plannedRequests = plannedPrimarySubjects(
      deriveSearchSubjects(plannerScenes),
    );
    const scenePlan = plannerScenes.map((scene) => {
      const assignment = assignments.get(scene.sceneId);
      return {
        sceneId: scene.sceneId,
        selectionReason: assignment?.selectionReason ?? null,
        subjectIds: assignment?.subjectIds ?? [],
        visualCue: scene.visualCue ?? null,
        queries: [...scene.imageSearchIntent],
        cueQuery: scene.cueQuery ?? null,
        plannedRequests: plannedRequests.filter(
          (request) => request.subjectKey === poolSubjectKey(scene),
        ),
      };
    });
    await Promise.all([
      writeFile(
        resolve(options.outputDirectory, 'catalog.json'),
        `${JSON.stringify(enrichment.subjectCatalog, null, 2)}\n`,
        'utf8',
      ),
      writeFile(
        resolve(options.outputDirectory, 'assignments.json'),
        `${JSON.stringify(enrichment.sceneAssignments, null, 2)}\n`,
        'utf8',
      ),
      writeFile(
        resolve(options.outputDirectory, 'scene-plan.json'),
        `${JSON.stringify(scenePlan, null, 2)}\n`,
        'utf8',
      ),
    ]);
  }

  console.log(
    `Storyboard smoke complete: ${result.effectiveProvider}, ${result.draft.scenes.length} scenes${options.catalog ? ', catalog' : ''}`,
  );
}

if (isMainModule(import.meta.url)) {
  runCli(() => runStoryboardSmokeCli(process.argv.slice(2)));
}
