import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createDeterministicStoryboardProvider } from './fallback.js';
import { createNvidiaStoryboardProvider } from './nvidia.js';
import { generateStoryboard } from './orchestrator.js';
import type { StoryboardProvider } from './provider.js';
import { splitCanonicalSentences } from './sentences.js';

export interface StoryboardSmokeCliOptions {
  scriptPath: string;
  title: string;
  durationMs: number;
  outputDirectory: string;
  provider: 'nvidia' | 'deterministic';
}

const USAGE =
  'Usage: video:storyboard:smoke --script <canonical-script.txt> --title <title> --duration-ms <milliseconds> --output <directory> [--provider <nvidia|deterministic>]';

export function parseStoryboardSmokeCliArgs(
  argv: string[],
): StoryboardSmokeCliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(USAGE);
    }
    if (
      ![
        '--script',
        '--title',
        '--duration-ms',
        '--output',
        '--provider',
      ].includes(flag)
    ) {
      throw new Error(`Unknown option: ${flag}`);
    }
    values.set(flag, value);
  }

  const scriptPath = values.get('--script');
  const title = values.get('--title')?.trim();
  const durationRaw = values.get('--duration-ms');
  const outputDirectory = values.get('--output');
  if (!scriptPath || !title || !durationRaw || !outputDirectory) {
    throw new Error(USAGE);
  }
  const durationMs = Number(durationRaw);
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new Error('--duration-ms must be a positive integer');
  }

  const configuredProvider =
    values.get('--provider') ??
    process.env['VIDEO_STORYBOARD_PROVIDER']?.trim() ??
    'nvidia';
  if (
    configuredProvider !== 'nvidia' &&
    configuredProvider !== 'deterministic'
  ) {
    throw new Error(`Unsupported storyboard provider: ${configuredProvider}`);
  }

  return {
    scriptPath: resolve(scriptPath),
    title,
    durationMs,
    outputDirectory: resolve(outputDirectory),
    provider: configuredProvider,
  };
}

function createProvider(name: StoryboardSmokeCliOptions['provider']) {
  return name === 'nvidia'
    ? createNvidiaStoryboardProvider()
    : createDeterministicStoryboardProvider();
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
  const provider = providerOverride ?? createProvider(options.provider);
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
          slideCount: result.draft.slides.length,
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
    `Storyboard smoke complete: ${result.effectiveProvider}, ${result.draft.slides.length} slides`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    await runStoryboardSmokeCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 1;
  }
}
