import type { StoryboardDraft, StoryboardDraftSlide } from './draft.js';
import type {
  StoryboardProvider,
  StoryboardProviderRequest,
  StoryboardProviderResult,
} from './provider.js';
import {
  type CanonicalSentence,
  canonicalSentenceRangeText,
} from './sentences.js';
import { storyboardSlideCountRange } from './validation.js';

function clipText(value: string, maxCharacters: number): string {
  const characters = Array.from(value.trim());
  if (characters.length <= maxCharacters) return characters.join('');
  return characters.slice(0, maxCharacters).join('').trimEnd();
}

function sentenceGroups(
  sentences: readonly CanonicalSentence[],
  groupCount: number,
): CanonicalSentence[][] {
  const weights = sentences.map((sentence) => speakingWeight(sentence.text));
  const prefixWeights = [0];
  for (const weight of weights) {
    prefixWeights.push(prefixWeights.at(-1)! + weight);
  }
  const totalWeight = prefixWeights.at(-1)!;
  const boundaries = [0];
  for (let group = 1; group < groupCount; group += 1) {
    const previous = boundaries.at(-1)!;
    const min = previous + 1;
    const max = sentences.length - (groupCount - group);
    const target = (totalWeight * group) / groupCount;
    let selected = min;
    for (let candidate = min + 1; candidate <= max; candidate += 1) {
      if (
        Math.abs(prefixWeights[candidate]! - target) <
        Math.abs(prefixWeights[selected]! - target)
      ) {
        selected = candidate;
      }
    }
    boundaries.push(selected);
  }
  boundaries.push(sentences.length);

  return boundaries
    .slice(0, -1)
    .map((start, index) => sentences.slice(start, boundaries[index + 1]));
}

function firstNumericToken(value: string): string | null {
  return /[$€£¥]?\d[\d,.]*[%％]?/.exec(value)?.[0] ?? null;
}

function speakingWeight(value: string): number {
  const latinWords = value.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  const nonLatin = Array.from(value.replace(/[A-Za-z0-9\s]/g, '')).length;
  return Math.max(1, nonLatin + latinWords * 1.4);
}

function chooseBalancedGroups(
  sentences: readonly CanonicalSentence[],
  minGroups: number,
  maxGroups: number,
  durationMs: number,
): CanonicalSentence[][] {
  let best = sentenceGroups(sentences, minGroups);
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let groupCount = minGroups; groupCount <= maxGroups; groupCount += 1) {
    const groups = sentenceGroups(sentences, groupCount);
    const totalWeight = sentences.reduce(
      (sum, sentence) => sum + speakingWeight(sentence.text),
      0,
    );
    const penalty = groups.reduce((sum, group) => {
      const weight = group.reduce(
        (groupSum, sentence) => groupSum + speakingWeight(sentence.text),
        0,
      );
      const estimatedDuration = (durationMs * weight) / totalWeight;
      const under = Math.max(0, 9_000 - estimatedDuration);
      const over = Math.max(0, estimatedDuration - 12_000);
      const targetDelta = Math.abs(10_500 - estimatedDuration) * 0.05;
      return sum + under + over + targetDelta;
    }, 0);
    if (penalty < bestPenalty) {
      best = groups;
      bestPenalty = penalty;
    }
  }
  return best;
}

function removeUngroundedNumbers(value: string, evidence: string): string {
  return value
    .replace(/[$€£¥]?\d[\d,.]*[%％]?/g, (token) =>
      evidence.includes(token) ? token : '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function rangeText(
  script: string,
  sentences: readonly CanonicalSentence[],
  group: readonly CanonicalSentence[],
): string {
  const first = group[0];
  const last = group.at(-1);
  if (!first || !last) throw new Error('Fallback sentence group is empty');
  return (
    canonicalSentenceRangeText(script, sentences, first.id, last.id) ??
    group.map((sentence) => sentence.text).join('')
  );
}

export function createDeterministicStoryboard(input: {
  title: string;
  script: string;
  durationMs: number;
  sentences: readonly CanonicalSentence[];
}): StoryboardDraft {
  if (input.sentences.length === 0) {
    throw new Error('Cannot build a storyboard from an empty canonical script');
  }

  const range = storyboardSlideCountRange(
    input.durationMs,
    input.sentences.length,
  );
  const groups = chooseBalancedGroups(
    input.sentences,
    range.min,
    range.max,
    input.durationMs,
  );

  const slides = groups.map((group, index): StoryboardDraftSlide => {
    const first = group[0]!;
    const last = group.at(-1)!;
    const evidence = rangeText(input.script, input.sentences, group).trim();
    const excerpt = clipText(evidence, 180);

    if (index === 0) {
      const groundedTitle = removeUngroundedNumbers(input.title, evidence);
      return {
        template: 'cover',
        startSentenceId: first.id,
        endSentenceId: last.id,
        kicker: 'ZAP PILOT · PODCAST BRIEFING',
        headline: clipText(groundedTitle || excerpt, 96),
        subheadline: clipText(excerpt, 128),
        imageSearchIntent: [],
      };
    }

    const number = firstNumericToken(evidence);
    if (number) {
      return {
        template: 'statistic',
        startSentenceId: first.id,
        endSentenceId: last.id,
        evidenceText: excerpt,
        imageSearchIntent: [],
        eyebrow: '原稿重點數據',
        value: clipText(number, 24),
        label: clipText(excerpt, 96),
      };
    }

    return {
      template: 'sourceQuote',
      startSentenceId: first.id,
      endSentenceId: last.id,
      evidenceText: excerpt,
      imageSearchIntent: [],
      eyebrow: 'CANONICAL SCRIPT',
      quote: excerpt,
      citation: '原始 Podcast 講稿',
    };
  });

  return { slides };
}

const DETERMINISTIC_STORYBOARD_MODEL = 'deterministic-v1';

export function createDeterministicStoryboardProvider(): StoryboardProvider {
  return {
    name: 'deterministic',
    model: DETERMINISTIC_STORYBOARD_MODEL,
    generate(
      request: StoryboardProviderRequest,
    ): Promise<StoryboardProviderResult> {
      return Promise.resolve({
        draft: createDeterministicStoryboard(request),
        model: DETERMINISTIC_STORYBOARD_MODEL,
        usage: null,
      });
    },
  };
}
