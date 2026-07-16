import type { CanonicalAudioTiming } from '../audio-analysis.js';
import {
  OUTPUT_FPS,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  parseSlideVideoManifest,
  type SlideSource,
  type SlideVideoManifest,
} from '../manifest.js';
import type { StoryboardDraft, StoryboardDraftSlide } from './draft.js';
import type { CanonicalSentence } from './sentences.js';

export const TRUSTED_RENDERER_VERSION = 'satori-resvg-v2' as const;

function slideContent(slide: StoryboardDraftSlide): Record<string, unknown> {
  const content: Record<string, unknown> = { ...slide };
  delete content['startSentenceId'];
  delete content['endSentenceId'];
  delete content['imageSearchIntent'];
  delete content['evidenceText'];
  return content;
}

export function materializeStoryboardManifest(input: {
  draft: StoryboardDraft;
  sentences: readonly CanonicalSentence[];
  timing: CanonicalAudioTiming;
  episode: {
    id: string;
    localizationId: string;
    languageCode: string;
    title: string;
  };
  audioSource: string;
  source: SlideSource;
}): SlideVideoManifest {
  const timedBySentenceId = new Map(
    input.timing.sentences.map((timed) => [timed.sentence.id, timed]),
  );
  const knownSentenceIds = new Set(
    input.sentences.map((sentence) => sentence.id),
  );

  const slides = input.draft.slides.map((draftSlide, index) => {
    if (
      !knownSentenceIds.has(draftSlide.startSentenceId) ||
      !knownSentenceIds.has(draftSlide.endSentenceId)
    ) {
      throw new Error('Storyboard references an unknown canonical sentence ID');
    }
    const start = timedBySentenceId.get(draftSlide.startSentenceId);
    const end = timedBySentenceId.get(draftSlide.endSentenceId);
    if (!start || !end) {
      throw new Error('Audio timing is missing a storyboard sentence range');
    }
    return {
      // Slide ids must match the manifest's /^[a-z\d][a-z\d-]*$/ pattern, so the
      // camelCase template names (photoFact, sourceQuote) are lower-cased here.
      id: `slide-${String(index + 1).padStart(2, '0')}-${draftSlide.template.toLowerCase()}`,
      startMs: start.startMs,
      endMs: end.endMs,
      ...slideContent(draftSlide),
      sources: [input.source],
      asset: { kind: 'none' as const },
    };
  });

  return parseSlideVideoManifest({
    schemaVersion: 'podcast-slide-video.v1',
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
