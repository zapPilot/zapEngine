import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assertOnlyKnownFlags, parseFlagArgs } from '../../../lib/cli-args.js';
import { runCli } from '../../../lib/cli-runner.js';
import { isMainModule } from '../../../lib/is-main-module.js';
import { createDeterministicStoryboardProvider } from './fallback.js';
import { generateStoryboard } from './orchestrator.js';
import type { StoryboardProvider } from './provider.js';
import { splitCanonicalSentences } from './sentences.js';

export interface StoryboardSmokeCliOptions {
  scriptPath: string;
  title: string;
  durationMs: number;
  outputDirectory: string;
}

const USAGE =
  'Usage: video:storyboard:smoke --script <canonical-script.txt> --title <title> --duration-ms <milliseconds> --output <directory>';

export function parseStoryboardSmokeCliArgs(
  argv: string[],
): StoryboardSmokeCliOptions {
  const parsed = parseFlagArgs(['video:storyboard:smoke', ...argv]);
  assertOnlyKnownFlags(
    parsed,
    ['script', 'title', 'duration-ms', 'output'],
    USAGE,
  );

  const scriptFlag = parsed.flags['script'];
  const titleFlag = parsed.flags['title'];
  const durationFlag = parsed.flags['duration-ms'];
  const outputFlag = parsed.flags['output'];
  if (
    typeof scriptFlag === 'boolean' ||
    typeof titleFlag === 'boolean' ||
    typeof durationFlag === 'boolean' ||
    typeof outputFlag === 'boolean'
  ) {
    throw new Error(USAGE);
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
  };
}

function estimatedTokens(value: string): number {
  return Math.max(1, Math.ceil(Array.from(value).length / 2));
}

export async function runStoryboardSmokeCli(
  argv: string[],
  providerOverride?: StoryboardProvider,
): Promise<void> {
  const options = parseStoryboardSmokeCliArgs(argv);
  const script = await readFile(options.scriptPath, 'utf8');
  const provider = providerOverride ?? createDeterministicStoryboardProvider();
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

  console.log(
    `Storyboard smoke complete: ${result.effectiveProvider}, ${result.draft.scenes.length} scenes`,
  );
}

if (isMainModule(import.meta.url)) {
  runCli(() => runStoryboardSmokeCli(process.argv.slice(2)));
}
