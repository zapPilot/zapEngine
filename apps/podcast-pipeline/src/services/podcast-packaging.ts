import {
  MAX_STORYBOARD_SLIDES,
  type StoryboardDraft,
  type StoryboardDraftScene,
} from './video/storyboard/draft.js';
import { splitCanonicalSentences } from './video/storyboard/sentences.js';

export const PODCAST_INTRO = '歡迎收聽 Zap Podcast。';
export const ZAP_PILOT_OUTRO =
  '如果你也在管理多個錢包、DeFi 部位和投資組合，可以到 Zap Pilot 官網，讓投資組合管理更簡單、更清楚。';

export const PODCAST_INTRO_VISUAL_INTENT = 'brand:zap-podcast-intro';
export const ZAP_PILOT_OUTRO_VISUAL_INTENT = 'brand:zap-pilot-outro';

const LEGACY_PODCAST_INTROS = [
  '各位觀眾朋友，歡迎收聽今天的 Zap Podcast。',
  PODCAST_INTRO,
] as const;

export type PodcastBrandVisualKind = 'intro' | 'outro';

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
  if (imageSearchIntent.includes(ZAP_PILOT_OUTRO_VISUAL_INTENT)) return 'outro';
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
  const bodyEndIndex = sentences.length - 2;
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
    const wasClipped = clippedStart !== startIndex || clippedEnd !== endIndex;
    return [
      {
        ...scene,
        startSentenceId: startSentence.id,
        endSentenceId: endSentence.id,
        ...(wasClipped
          ? {
              imageSearchIntent: [
                contentSearchIntent(sentences, clippedStart, clippedEnd),
              ],
            }
          : {}),
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
    {
      sceneId: 'scene-01',
      startSentenceId: lastSentence.id,
      endSentenceId: lastSentence.id,
      imageSearchIntent: [ZAP_PILOT_OUTRO_VISUAL_INTENT],
    },
  ].map((scene, index) => ({
    ...scene,
    sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
  }));

  return { scenes };
}

function stripKnownPodcastPackaging(rawScript: string): string {
  let body = rawScript.trim();
  for (const intro of LEGACY_PODCAST_INTROS) {
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

function contentSearchIntent(
  sentences: readonly { text: string }[],
  startIndex: number,
  endIndex: number,
): string {
  const text = sentences
    .slice(startIndex, endIndex + 1)
    .map((sentence) => sentence.text)
    .join(' ')
    .trim();
  const bounded = [...text].slice(0, 80).join('').trim();
  return bounded.length >= 2 ? bounded : 'article topic';
}

function boundContentScenes(
  scenes: readonly StoryboardDraftScene[],
): StoryboardDraftScene[] {
  const maxContentScenes = MAX_STORYBOARD_SLIDES - 2;
  if (scenes.length <= maxContentScenes) return [...scenes];

  const kept = scenes.slice(0, maxContentScenes);
  const overflowEnd = scenes.at(-1)?.endSentenceId;
  const lastKept = kept.at(-1);
  if (!lastKept || !overflowEnd) return kept;
  kept[kept.length - 1] = { ...lastKept, endSentenceId: overflowEnd };
  return kept;
}
