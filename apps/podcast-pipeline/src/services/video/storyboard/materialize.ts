import type { CanonicalAudioTiming } from '../audio-analysis.js';
import {
  headlineKickerFor,
  OUTRO_TITLE,
  outroCallToActionFor,
  wrapHeadlineTitle,
} from '../headline.js';
import {
  MEDIA_WINDOW,
  OUTPUT_FPS,
  OUTRO_TAIL_MS,
  parseVerticalVideoManifest,
  PORTRAIT_OUTPUT_HEIGHT,
  PORTRAIT_OUTPUT_WIDTH,
  VERTICAL_VIDEO_SCHEMA_VERSION,
  type VerticalVideoManifest,
} from '../manifest.js';
import { pickBgmTrack } from '../runtime-assets.js';
import type { SceneSentenceAlignment } from '../scene-alignment.js';
import { type ImageVisualPlan, parseImageVisualPlan } from './visual-plan.js';

export const TRUSTED_RENDERER_VERSION = 'satori-resvg-v4' as const;
export const BGM_MIX_GAIN_DB = -21;

export interface MaterializeLocaleVideoManifestInput {
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

export function materializeLocaleVideoManifest(
  input: MaterializeLocaleVideoManifestInput,
): VerticalVideoManifest {
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

  return parseVerticalVideoManifest({
    schemaVersion: VERTICAL_VIDEO_SCHEMA_VERSION,
    rendererVersion: TRUSTED_RENDERER_VERSION,
    episode: input.episode,
    clip: {
      startMs: 0,
      durationMs: input.timing.durationMs + OUTRO_TAIL_MS,
      width: PORTRAIT_OUTPUT_WIDTH,
      height: PORTRAIT_OUTPUT_HEIGHT,
      fps: OUTPUT_FPS,
      transitionMs: 200,
    },
    mediaWindow: MEDIA_WINDOW,
    headline: {
      kicker: headlineKickerFor(input.episode.languageCode),
      titleLines: wrapHeadlineTitle(input.episode.title),
    },
    audio: {
      sourceUrl: input.audioSource,
      narrationDurationMs: input.timing.durationMs,
    },
    bgm: { trackId: pickBgmTrack(input.episode.id), gainDb: BGM_MIX_GAIN_DB },
    outro: {
      startMs: input.timing.durationMs,
      title: OUTRO_TITLE,
      callToAction: outroCallToActionFor(input.episode.languageCode),
    },
    slides,
    captions: input.timing.captions,
  });
}
