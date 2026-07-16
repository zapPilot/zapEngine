import { createHash } from 'node:crypto';

import {
  assertMainNarrationAudioSource,
  buildWeightedCaptionTiming,
  detectAudioSilences,
  probeAudioDurationMs,
  type SilenceInterval,
} from './audio-analysis.js';
import type { SlideVideoManifest } from './manifest.js';
import { createDeterministicStoryboardProvider } from './storyboard/fallback.js';
import { materializeStoryboardManifest } from './storyboard/materialize.js';
import { createNvidiaStoryboardProvider } from './storyboard/nvidia.js';
import {
  generateStoryboard,
  type StoryboardAttemptReport,
} from './storyboard/orchestrator.js';
import type {
  StoryboardProvider,
  StoryboardTokenUsage,
} from './storyboard/provider.js';
import { splitCanonicalSentences } from './storyboard/sentences.js';

export const STORYBOARD_PROMPT_VERSION = 'nvidia-storyboard-v1' as const;

export interface EpisodeAudioAnalysis {
  durationMs: number;
  silences: SilenceInterval[];
}

export async function analyzeEpisodeAudio(
  hlsUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<EpisodeAudioAnalysis> {
  assertMainNarrationAudioSource(hlsUrl);
  const processOptions = options.signal ? { signal: options.signal } : {};
  const durationMs = await probeAudioDurationMs(hlsUrl, processOptions);
  const silences = await detectAudioSilences(hlsUrl, processOptions);
  return { durationMs, silences };
}

function sourceLabel(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return '原始文章';
  }
}

function configuredProvider(): StoryboardProvider {
  const name =
    process.env['VIDEO_STORYBOARD_PROVIDER']?.trim() ?? 'deterministic';
  if (name === 'nvidia') return createNvidiaStoryboardProvider();
  if (name === 'deterministic') return createDeterministicStoryboardProvider();
  throw new Error(`Unsupported VIDEO_STORYBOARD_PROVIDER: ${name}`);
}

export interface EpisodeVideoManifestResult {
  manifest: SlideVideoManifest;
  manifestJson: string;
  manifestHash: string;
  scriptHash: string;
  provenance: {
    requestedProvider: string;
    effectiveProvider: string;
    model: string | null;
    promptVersion: typeof STORYBOARD_PROMPT_VERSION;
    rendererVersion: string;
    usedFallback: boolean;
  };
  validation: {
    attempts: StoryboardAttemptReport[];
    usage: StoryboardTokenUsage;
  };
}

export async function createEpisodeVideoManifest(input: {
  episodeId: string;
  localizationId: string;
  title: string;
  script: string;
  hlsUrl: string;
  sourceUrl: string;
  durationMs: number;
  silences?: readonly SilenceInterval[];
  languageCode?: string;
  signal?: AbortSignal;
  provider?: StoryboardProvider;
}): Promise<EpisodeVideoManifestResult> {
  assertMainNarrationAudioSource(input.hlsUrl);
  const provider = input.provider ?? configuredProvider();
  const generated = await generateStoryboard({
    title: input.title,
    script: input.script,
    durationMs: input.durationMs,
    provider,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const sentences = splitCanonicalSentences(input.script);
  const timing = buildWeightedCaptionTiming({
    script: input.script,
    durationMs: input.durationMs,
    ...(input.silences ? { silences: input.silences } : {}),
  });
  const manifest = materializeStoryboardManifest({
    draft: generated.draft,
    sentences,
    timing,
    episode: {
      id: input.episodeId,
      localizationId: input.localizationId,
      languageCode: input.languageCode ?? 'zh-Hant',
      title: input.title,
    },
    audioSource: input.hlsUrl,
    source: {
      id: 'canonical-article',
      label: sourceLabel(input.sourceUrl),
      url: input.sourceUrl,
      attribution: `原始文章 · ${sourceLabel(input.sourceUrl)}`,
      license: 'unknown',
      licenseUrl: null,
    },
  });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  return {
    manifest,
    manifestJson,
    manifestHash: createHash('sha256').update(manifestJson).digest('hex'),
    scriptHash: createHash('sha256').update(input.script).digest('hex'),
    provenance: {
      requestedProvider: generated.requestedProvider,
      effectiveProvider: generated.effectiveProvider,
      model: generated.model,
      promptVersion: STORYBOARD_PROMPT_VERSION,
      rendererVersion: manifest.rendererVersion,
      usedFallback: generated.usedFallback,
    },
    validation: {
      attempts: generated.attempts,
      usage: generated.totalUsage,
    },
  };
}
