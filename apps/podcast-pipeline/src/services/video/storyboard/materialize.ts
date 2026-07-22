import type { CanonicalAudioTiming } from '../audio-analysis.js';
import {
  type ImageVideoManifest,
  OUTPUT_FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  parseImageVideoManifest,
} from '../manifest.js';
import type { SceneSentenceAlignment } from '../scene-alignment.js';
import { type ImageVisualPlan, parseImageVisualPlan } from './visual-plan.js';

export const TRUSTED_RENDERER_VERSION = 'satori-resvg-v3' as const;

export interface MaterializeLocaleImageVideoManifestInput {
  visualPlan: ImageVisualPlan;
  timing: CanonicalAudioTiming;
  sceneAlignment: readonly SceneSentenceAlignment[];
  episode: {
    id: string;
    localizationId: string;
    languageCode: string;
    title: string;
  };
  audioSource: string;
}

export function materializeLocaleImageVideoManifest(
  input: MaterializeLocaleImageVideoManifestInput,
): ImageVideoManifest {
  const visualPlan = parseImageVisualPlan(input.visualPlan);
  if (input.sceneAlignment.length !== visualPlan.scenes.length) {
    throw new Error(
      `Expected ${visualPlan.scenes.length} aligned scenes, received ${input.sceneAlignment.length}`,
    );
  }

  const timedBySentenceId = new Map(
    input.timing.sentences.map((timed) => [timed.sentence.id, timed]),
  );
  const localSentenceIndex = new Map(
    input.timing.sentences.map((timed, index) => [timed.sentence.id, index]),
  );
  let expectedLocalStartIndex = 0;

  const slides = visualPlan.scenes.map((scene, index) => {
    const alignment = input.sceneAlignment[index];
    if (alignment?.sceneId !== scene.sceneId) {
      throw new Error(
        `Scene alignment ${index + 1} must reference ${scene.sceneId}`,
      );
    }

    const startIndex = localSentenceIndex.get(alignment.startSentenceId);
    const endIndex = localSentenceIndex.get(alignment.endSentenceId);
    if (startIndex === undefined || endIndex === undefined) {
      throw new Error(
        `Scene ${scene.sceneId} references an unknown locale sentence`,
      );
    }
    if (startIndex !== expectedLocalStartIndex || endIndex < startIndex) {
      throw new Error(
        `Scene ${scene.sceneId} must cover the next contiguous locale sentence range`,
      );
    }
    expectedLocalStartIndex = endIndex + 1;

    const start = timedBySentenceId.get(alignment.startSentenceId);
    const end = timedBySentenceId.get(alignment.endSentenceId);
    if (!start || !end) {
      throw new Error(
        `Locale timing is missing the sentence range for ${scene.sceneId}`,
      );
    }

    return {
      id: scene.sceneId,
      startMs: start.startMs,
      endMs: end.endMs,
      template: 'image' as const,
      sources: scene.sources,
      asset: scene.asset,
    };
  });

  if (expectedLocalStartIndex !== input.timing.sentences.length) {
    throw new Error('Scene alignment must cover every locale sentence');
  }

  return parseImageVideoManifest({
    schemaVersion: 'podcast-slide-video.v2',
    rendererVersion: TRUSTED_RENDERER_VERSION,
    episode: input.episode,
    clip: {
      startMs: 0,
      durationMs: input.timing.durationMs,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      fps: OUTPUT_FPS,
      transitionMs: 200,
    },
    audio: { sourceUrl: input.audioSource },
    slides,
    captions: input.timing.captions,
  });
}
