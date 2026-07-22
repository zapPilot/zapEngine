import { createHash } from 'node:crypto';

import {
  assertMainNarrationAudioSource,
  buildWeightedCaptionTiming,
  detectAudioSilences,
  probeAudioDurationMs,
  type SilenceInterval,
} from './audio-analysis.js';
import type { ImageVideoManifest } from './manifest.js';
import {
  alignLocalizedScenes,
  canonicalSceneAlignment,
  type SceneAlignmentProvider,
} from './scene-alignment.js';
import { materializeLocaleImageVideoManifest } from './storyboard/materialize.js';
import {
  type ImageVisualPlan,
  parseImageVisualPlan,
} from './storyboard/visual-plan.js';

export const SCENE_ALIGNMENT_PROMPT_VERSION =
  'semantic-scene-alignment-v1' as const;

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

export interface EpisodeVideoManifestResult {
  manifest: ImageVideoManifest;
  manifestJson: string;
  manifestHash: string;
  scriptHash: string;
  provenance: {
    storyboardProvider: string;
    storyboardModel: string | null;
    promptVersion: typeof SCENE_ALIGNMENT_PROMPT_VERSION;
    rendererVersion: string;
  };
}

export async function createEpisodeVideoManifest(input: {
  episodeId: string;
  localizationId: string;
  title: string;
  script: string;
  canonicalScript: string;
  visualPlan: ImageVisualPlan;
  storyboardProvider: string;
  storyboardModel: string | null;
  hlsUrl: string;
  durationMs: number;
  silences?: readonly SilenceInterval[];
  languageCode: 'zh-Hant' | 'ja' | 'en';
  signal?: AbortSignal;
  alignmentProvider?: SceneAlignmentProvider;
}): Promise<EpisodeVideoManifestResult> {
  assertMainNarrationAudioSource(input.hlsUrl);
  const visualPlan = parseImageVisualPlan(input.visualPlan);
  const timing = buildWeightedCaptionTiming({
    script: input.script,
    durationMs: input.durationMs,
    ...(input.silences ? { silences: input.silences } : {}),
  });
  const sceneAnchors = visualPlan.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    startSentenceId: scene.startSentenceId,
    endSentenceId: scene.endSentenceId,
  }));
  let sceneAlignment;
  if (input.languageCode === 'zh-Hant') {
    sceneAlignment = canonicalSceneAlignment(sceneAnchors, input.script);
  } else {
    const alignmentOptions = {
      ...(input.alignmentProvider ? { provider: input.alignmentProvider } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    };
    sceneAlignment = await alignLocalizedScenes(
      {
        canonicalScript: input.canonicalScript,
        localizedScript: input.script,
        languageCode: input.languageCode,
        scenes: sceneAnchors,
      },
      alignmentOptions,
    );
  }
  const manifest = materializeLocaleImageVideoManifest({
    visualPlan,
    timing,
    sceneAlignment,
    episode: {
      id: input.episodeId,
      localizationId: input.localizationId,
      languageCode: input.languageCode,
      title: input.title,
    },
    audioSource: input.hlsUrl,
  });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  return {
    manifest,
    manifestJson,
    manifestHash: createHash('sha256').update(manifestJson).digest('hex'),
    scriptHash: createHash('sha256').update(input.script).digest('hex'),
    provenance: {
      storyboardProvider: input.storyboardProvider,
      storyboardModel: input.storyboardModel,
      promptVersion: SCENE_ALIGNMENT_PROMPT_VERSION,
      rendererVersion: manifest.rendererVersion,
    },
  };
}
