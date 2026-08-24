import {
  MAX_STORYBOARD_SLIDES,
  type StoryboardDraft,
  type StoryboardDraftScene,
} from './video/storyboard/draft.js';
import { splitCanonicalSentences } from './video/storyboard/sentences.js';
import {
  storyboardSceneCountRange,
  type StoryboardValidationResult,
  validateStoryboardDraft,
} from './video/storyboard/validation.js';

export const PODCAST_INTRO = '歡迎收聽 Zap Podcast。';
export const ZAP_PILOT_OUTRO =
  '如果你也在管理多個錢包、DeFi 部位和投資組合，可以到 Zap Pilot 官網，讓投資組合管理更簡單、更清楚。';

export const PODCAST_INTRO_VISUAL_INTENT = 'brand:zap-podcast-intro';

const STRIPPABLE_PODCAST_INTROS = [
  '各位觀眾朋友，歡迎收聽今天的 Zap Podcast。',
  PODCAST_INTRO,
] as const;

export type PodcastBrandVisualKind = 'intro';

export function packagePodcastScript(rawBody: string): string {
  const body = stripKnownPodcastPackaging(rawBody);
  if (!body) {
    throw new Error('Podcast body is empty after removing generated packaging');
  }
  return [PODCAST_INTRO, body, ZAP_PILOT_OUTRO].join('\n\n');
}

export function podcastBrandVisualKind(
  imageSearchIntent: readonly string[],
): PodcastBrandVisualKind | null {
  if (imageSearchIntent.includes(PODCAST_INTRO_VISUAL_INTENT)) return 'intro';
  return null;
}

export function applyPodcastBrandingToStoryboard(
  script: string,
  draft: StoryboardDraft,
): StoryboardDraft {
  const sentences = splitCanonicalSentences(script);
  const firstSentence = sentences[0];
  const lastSentence = sentences.at(-1);
  if (
    sentences.length < 3 ||
    firstSentence?.text !== PODCAST_INTRO ||
    lastSentence?.text !== ZAP_PILOT_OUTRO
  ) {
    return draft;
  }

  const sentenceIndex = new Map(
    sentences.map((sentence) => [sentence.id, sentence.index]),
  );
  const bodyStartIndex = 1;
  const contentEndIndex = sentences.length - 1;
  const contentScenes = draft.scenes.flatMap((scene) => {
    const startIndex = sentenceIndex.get(scene.startSentenceId);
    const endIndex = sentenceIndex.get(scene.endSentenceId);
    if (startIndex === undefined || endIndex === undefined) return [];

    const clippedStart = Math.max(startIndex, bodyStartIndex);
    const clippedEnd = Math.min(endIndex, contentEndIndex);
    if (clippedStart > clippedEnd) return [];

    const startSentence = sentences[clippedStart];
    const endSentence = sentences[clippedEnd];
    if (!startSentence || !endSentence) return [];
    return [
      {
        ...scene,
        startSentenceId: startSentence.id,
        endSentenceId: endSentence.id,
      },
    ];
  });

  if (contentScenes.length === 0) return draft;
  const boundedContentScenes = boundContentScenes(contentScenes);
  const scenes: StoryboardDraftScene[] = [
    {
      sceneId: 'scene-01',
      startSentenceId: firstSentence.id,
      endSentenceId: firstSentence.id,
      imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
    },
    ...boundedContentScenes,
  ].map((scene, index) => ({
    ...scene,
    sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
  }));

  return { scenes };
}

export function applyAndValidatePodcastBrandingToStoryboard(
  script: string,
  draft: StoryboardDraft,
  durationMs: number,
): StoryboardDraft {
  const branded = applyPodcastBrandingToStoryboard(script, draft);
  const validation = validatePodcastStoryboardDraft(
    script,
    branded,
    durationMs,
  );
  if (!validation.success) {
    const details = validation.issues
      .map((issue) => `${issue.code}: ${issue.message}`)
      .join('; ');
    throw new Error(`Branded podcast storyboard is invalid: ${details}`);
  }
  return validation.draft;
}

export function validatePodcastStoryboardDraft(
  script: string,
  draft: StoryboardDraft,
  durationMs: number,
): StoryboardValidationResult {
  const sentences = splitCanonicalSentences(script);
  return validateStoryboardDraft(draft, {
    script,
    sentences,
    durationMs,
    sceneCountRange: podcastBrandedSceneCountRange(
      durationMs,
      sentences.length,
      script,
    ),
  });
}

function stripKnownPodcastPackaging(rawScript: string): string {
  let body = rawScript.trim();
  for (const intro of STRIPPABLE_PODCAST_INTROS) {
    if (body.startsWith(intro)) {
      body = body.slice(intro.length).trim();
      break;
    }
  }
  if (body.endsWith(ZAP_PILOT_OUTRO)) {
    body = body.slice(0, -ZAP_PILOT_OUTRO.length).trim();
  }
  return body;
}

function boundContentScenes(
  scenes: readonly StoryboardDraftScene[],
): StoryboardDraftScene[] {
  const maxContentScenes = MAX_STORYBOARD_SLIDES - 1;
  if (scenes.length <= maxContentScenes) return [...scenes];

  const kept = scenes.slice(0, maxContentScenes);
  const overflowEnd = scenes.at(-1)?.endSentenceId;
  const lastKept = kept.at(-1);
  if (!lastKept || !overflowEnd) return kept;
  kept[kept.length - 1] = { ...lastKept, endSentenceId: overflowEnd };
  return kept;
}

export function podcastContentSceneCountRange(
  durationMs: number,
  sentenceCount: number,
  script: string,
): { min: number; max: number } {
  const range = storyboardSceneCountRange(durationMs, sentenceCount);
  if (!hasCurrentPodcastPackaging(script)) return range;
  const max = Math.max(1, Math.min(range.max - 1, MAX_STORYBOARD_SLIDES - 1));
  return { min: Math.min(range.min, max), max };
}

function podcastBrandedSceneCountRange(
  durationMs: number,
  sentenceCount: number,
  script: string,
): { min: number; max: number } {
  const content = podcastContentSceneCountRange(
    durationMs,
    sentenceCount,
    script,
  );
  if (!hasCurrentPodcastPackaging(script)) return content;
  return { min: content.min + 1, max: content.max + 1 };
}

function hasCurrentPodcastPackaging(script: string): boolean {
  const sentences = splitCanonicalSentences(script);
  return (
    sentences[0]?.text === PODCAST_INTRO &&
    sentences.at(-1)?.text === ZAP_PILOT_OUTRO
  );
}
