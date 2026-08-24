import {
  MAX_STORYBOARD_SLIDES,
  type StoryboardDraft,
  type StoryboardDraftScene,
} from './video/storyboard/draft.js';
import {
  type CanonicalSentence,
  splitCanonicalSentences,
} from './video/storyboard/sentences.js';
import {
  storyboardSceneCountRange,
  type StoryboardValidationResult,
  validateStoryboardDraft,
} from './video/storyboard/validation.js';

export const PODCAST_INTRO = '歡迎收聽 Zap Podcast。';
export const PODCAST_PACKAGING_VERSION = 'podcast-script.v1';
export const ZAP_PILOT_OUTRO =
  '如果你也在管理多個錢包、DeFi 部位和投資組合，可以到 Zap Pilot 官網，讓投資組合管理更簡單、更清楚。';

export const PODCAST_INTRO_VISUAL_INTENT = 'brand:zap-podcast-intro';
export const PODCAST_OUTRO_VISUAL_INTENT = 'brand:zap-pilot-outro';

const STRIPPABLE_PODCAST_INTROS = [
  '各位觀眾朋友，歡迎收聽今天的 Zap Podcast。',
  PODCAST_INTRO,
] as const;

export type PodcastBrandVisualKind = 'intro' | 'outro';

export interface PodcastVisualSections {
  intro: CanonicalSentence | null;
  body: CanonicalSentence[];
  outro: CanonicalSentence | null;
  isPackaged: boolean;
}

export function splitPodcastVisualSections(
  script: string,
): PodcastVisualSections {
  const sentences = splitCanonicalSentences(script);
  if (
    sentences.length >= 3 &&
    sentences[0]?.text === PODCAST_INTRO &&
    sentences.at(-1)?.text === ZAP_PILOT_OUTRO
  ) {
    return {
      intro: sentences[0] ?? null,
      body: sentences.slice(1, -1),
      outro: sentences.at(-1) ?? null,
      isPackaged: true,
    };
  }
  return {
    intro: null,
    body: sentences,
    outro: null,
    isPackaged: false,
  };
}

export function getPodcastEditorialScript(script: string): string {
  const sections = splitPodcastVisualSections(script);
  if (!sections.isPackaged) return script;
  if (sections.body.length === 0) return script;
  const first = sections.body[0]!;
  const last = sections.body.at(-1)!;
  const bodyText = script.slice(first.startOffset, last.endOffset);
  return bodyText.trim();
}

export function getEnglishBodyScript(
  englishScript: string,
  isPackaged: boolean,
): string {
  if (!isPackaged) return englishScript;
  if (!englishScript.trim()) return englishScript;
  const sentences = splitCanonicalSentences(englishScript);
  if (sentences.length < 3) return englishScript;
  const body = sentences.slice(1, -1);
  if (body.length === 0) return englishScript;
  return englishScript
    .slice(body[0]!.startOffset, body.at(-1)!.endOffset)
    .trim();
}

export function getPodcastEditorialSentences(
  script: string,
): CanonicalSentence[] {
  const sections = splitPodcastVisualSections(script);
  if (!sections.isPackaged) return splitCanonicalSentences(script);
  const body = sections.body;
  const baseOffset = body[0]!.startOffset;
  return body.map((sentence, index) => ({
    id: sentence.id,
    index,
    text: sentence.text,
    startOffset: sentence.startOffset - baseOffset,
    endOffset: sentence.endOffset - baseOffset,
  }));
}

export function getEnglishBodySentences(
  englishScript: string,
  isPackaged: boolean,
): CanonicalSentence[] {
  if (!isPackaged) return splitCanonicalSentences(englishScript);
  if (!englishScript.trim()) return splitCanonicalSentences(englishScript);
  const sentences = splitCanonicalSentences(englishScript);
  if (sentences.length < 3) return sentences;
  const body = sentences.slice(1, -1);
  if (body.length === 0) return sentences;
  const baseOffset = body[0]!.startOffset;
  return body.map((sentence, index) => ({
    id: sentence.id,
    // Re-index to 0 for validation, IDs preserved as original s0001 etc? For English, IDs are independent, but keep original IDs for consistency
    index,
    text: sentence.text,
    startOffset: sentence.startOffset - baseOffset,
    endOffset: sentence.endOffset - baseOffset,
  }));
}

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
  if (imageSearchIntent.includes(PODCAST_OUTRO_VISUAL_INTENT)) return 'outro';
  return null;
}

export function applyPodcastBrandingToStoryboard(
  script: string,
  draft: StoryboardDraft,
): StoryboardDraft {
  const sections = splitPodcastVisualSections(script);
  if (!sections.isPackaged || !sections.intro || !sections.outro) {
    return draft;
  }
  if (sections.body.length === 0) return draft;

  const sentences = splitCanonicalSentences(script);
  const sentenceIndex = new Map(
    sentences.map((sentence) => [sentence.id, sentence.index]),
  );
  const bodyStartIndex = sections.body[0]!.index;
  const bodyEndIndex = sections.body.at(-1)!.index;
  const contentScenes = draft.scenes.flatMap((scene) => {
    const startIndex = sentenceIndex.get(scene.startSentenceId);
    const endIndex = sentenceIndex.get(scene.endSentenceId);
    if (startIndex === undefined || endIndex === undefined) return [];

    const clippedStart = Math.max(startIndex, bodyStartIndex);
    const clippedEnd = Math.min(endIndex, bodyEndIndex);
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
  const extendedScenes: StoryboardDraftScene[] = boundedContentScenes.map(
    (scene, index) => {
      if (index === 0) {
        return { ...scene, startSentenceId: sections.intro!.id };
      }
      return scene;
    },
  );
  const outroScene: StoryboardDraftScene = {
    sceneId: 'scene-temp',
    startSentenceId: sections.outro.id,
    endSentenceId: sections.outro.id,
    imageSearchIntent: [PODCAST_OUTRO_VISUAL_INTENT],
  };
  const scenes: StoryboardDraftScene[] = [...extendedScenes, outroScene].map(
    (scene, index) => ({
      ...scene,
      sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
    }),
  );

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

export function stripKnownPodcastPackaging(rawScript: string): string {
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
  // -1 because the final slot is reserved for deterministic Zap Pilot outro
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
  // -1 because the final slot is reserved for deterministic Zap Pilot outro (not intro)
  const max = Math.max(1, Math.min(range.max - 1, MAX_STORYBOARD_SLIDES - 1));
  return { min: Math.min(range.min, max), max };
}

export function podcastEditorialSceneCountRange(
  durationMs: number,
  sentenceCount: number,
  isPackaged: boolean,
): { min: number; max: number } {
  const range = storyboardSceneCountRange(durationMs, sentenceCount);
  if (!isPackaged) return range;
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
