import type OpenAI from 'openai';

import { isRecord } from '../../../lib/typeGuards.js';
import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
} from '../../llm.js';
import {
  podcastBrandVisualKind,
  validatePodcastStoryboardDraft,
} from '../../podcast-packaging.js';
import { throwIfAborted } from '../abort.js';
import {
  MAX_SEARCH_INTENT_CHARACTERS,
  MAX_SEARCH_INTENTS_PER_SCENE,
  MIN_SEARCH_INTENT_CHARACTERS,
  type StoryboardDraft,
} from './draft.js';
import { balancedSearchEvidenceGroups } from './fallback.js';
import {
  type CanonicalSentence,
  canonicalSentenceRangeText,
  splitCanonicalSentences,
} from './sentences.js';
import { isGroundedSearchIntent } from './validation.js';

// One request per batch of scenes: a 64-scene episode does not fit one useful
// completion, and a failed batch only costs its own scenes their enrichment.
const SEARCH_INTENT_BATCH_SIZE = 14;
// Batches are independent completions, so they run in parallel; three at a time
// keeps the burst inside OpenRouter's per-key rate budget.
const SEARCH_INTENT_BATCH_CONCURRENCY = 3;
const SEARCH_INTENT_MAX_OUTPUT_TOKENS = 2_048;
// Image search is run against Bing, Pexels and Pixabay, all queried in English.
const NON_LATIN_SCRIPT_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export interface SearchIntentScene {
  sceneId: string;
  /** The canonical sentences this scene covers, and its grounding evidence. */
  text: string;
  /** The same span of the English search script, when the episode has one. */
  searchText?: string;
}

export interface SearchIntentRequest {
  title: string;
  scenes: readonly SearchIntentScene[];
  signal?: AbortSignal;
}

export interface SearchIntentProvider {
  readonly model: string;
  suggest(request: SearchIntentRequest): Promise<unknown>;
}

export interface SearchIntentEnrichment {
  draft: StoryboardDraft;
  /** Null unless a scene actually took generated intents, so provenance never
   * names a model that shaped nothing. */
  model: string | null;
  enrichedSceneCount: number;
  /** Scenes for which the model returned suggestions but none survived
   * grounding. Brand scenes are deliberately skipped and never discarded. */
  discardedSceneCount: number;
}

/**
 * Replaces the storyboard's search intents with concrete, photographable
 * subjects an LLM read out of each scene.
 *
 * The deterministic table this replaces maps a whole episode onto a handful of
 * canned phrases — every finance or crypto scene asks for the same
 * `blockchain developers office photo` — so the selected images are related to
 * the topic at best and unrelated to the scene at worst.
 *
 * Enrichment is best effort by design: it never fails a visual job. A batch
 * that errors, returns the wrong shape, or produces nothing usable leaves those
 * scenes on their deterministic intents, and the merged draft still has to clear
 * `validateStoryboardDraft` before it is returned.
 */
export async function enrichStoryboardSearchIntents(
  request: {
    draft: StoryboardDraft;
    title: string;
    searchTitle?: string;
    script: string;
    searchScript?: string;
    durationMs: number;
  },
  options: { provider?: SearchIntentProvider; signal?: AbortSignal } = {},
): Promise<SearchIntentEnrichment> {
  throwIfAborted(options.signal);
  const unchanged: SearchIntentEnrichment = {
    draft: request.draft,
    model: null,
    enrichedSceneCount: 0,
    discardedSceneCount: 0,
  };

  let provider: SearchIntentProvider;
  try {
    provider = options.provider ?? createOpenRouterSearchIntentProvider();
  } catch (error) {
    // An unconfigured OPENROUTER_API_KEY is a deployment state, not a render
    // failure: the storyboard already carries usable deterministic intents.
    warnSearchIntentFailure('provider', error);
    return unchanged;
  }

  const sentences = splitCanonicalSentences(request.script);
  const scenes = searchIntentScenes(request, sentences);
  if (!scenes) return unchanged;

  throwIfAborted(options.signal);
  const batchResults = await mapBatchesWithLimit(
    sceneBatches(scenes, SEARCH_INTENT_BATCH_SIZE),
    SEARCH_INTENT_BATCH_CONCURRENCY,
    async (batch) => {
      throwIfAborted(options.signal);
      try {
        const raw = await provider.suggest({
          title: request.searchTitle?.trim() || request.title,
          scenes: batch,
          ...(options.signal ? { signal: options.signal } : {}),
        });
        return parseSearchIntents(raw, batch);
      } catch (error) {
        throwIfAborted(options.signal);
        warnSearchIntentFailure(`batch ${batch[0]?.sceneId ?? 'empty'}`, error);
        return [];
      }
    },
  );

  // Applied in batch order, so a scene's intents never depend on which request
  // came back first.
  const suggested = new Map<string, string[]>();
  for (const entries of batchResults) {
    for (const [sceneId, intents] of entries) {
      suggested.set(sceneId, intents);
    }
  }
  if (suggested.size === 0) return unchanged;

  const evidenceBySceneId = new Map(
    scenes.map((scene) => [scene.sceneId, scene.text]),
  );
  let enrichedSceneCount = 0;
  let discardedSceneCount = 0;
  const enrichedScenes = request.draft.scenes.map((scene) => {
    if (podcastBrandVisualKind(scene.imageSearchIntent)) return scene;
    const grounded = (suggested.get(scene.sceneId) ?? []).filter((intent) =>
      isGroundedSearchIntent(
        intent,
        evidenceBySceneId.get(scene.sceneId) ?? '',
      ),
    );
    if (grounded.length === 0) {
      if (suggested.has(scene.sceneId)) discardedSceneCount += 1;
      return scene;
    }
    enrichedSceneCount += 1;
    return { ...scene, imageSearchIntent: grounded };
  });
  if (enrichedSceneCount === 0) {
    return { ...unchanged, discardedSceneCount };
  }

  const validation = validatePodcastStoryboardDraft(
    request.script,
    { scenes: enrichedScenes },
    request.durationMs,
  );
  if (!validation.success) {
    warnSearchIntentFailure(
      'validation',
      new Error(validation.issues.map((issue) => issue.message).join('; ')),
    );
    return {
      ...unchanged,
      discardedSceneCount: enrichedSceneCount + discardedSceneCount,
    };
  }

  return {
    draft: validation.draft,
    model: provider.model,
    enrichedSceneCount,
    discardedSceneCount,
  };
}

export function createOpenRouterSearchIntentProvider(): SearchIntentProvider {
  const { openai, model } = getOpenRouterConfig({ thinkingModel: null });
  return {
    model,
    async suggest(request) {
      const completion = await createOpenRouterChatCompletion(
        openai,
        {
          model,
          messages: searchIntentMessages(request),
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: SEARCH_INTENT_MAX_OUTPUT_TOKENS,
        },
        null,
        request.signal ? { signal: request.signal } : undefined,
      );
      return parseSearchIntentContent(
        completion.choices[0]?.message?.content ?? '',
      );
    },
  };
}

export function buildSearchIntentSystemPrompt(): string {
  return [
    'Choose 1 to 3 image-search phrases for each storyboard scene; each phrase must be English only.',
    '- Use concrete, photographable subjects from the scene: institutions, companies, people, places, objects, or events — describe what a camera could see.',
    '- Prefer specific subjects over generic concepts; each phrase must be 2 to 8 words and at most 80 characters.',
    '- Never write a number, date, share, or amount that is not already written in that scene.',
    '- No narration, headlines, captions, mood, layout, licenses, or URLs.',
    '- Return every scene once, in order, with the original sceneId.',
    'Return valid JSON only: {"scenes":[{"sceneId":"scene-01","imageSearchIntent":["federal reserve building washington"]}]}',
  ].join('\n');
}

function searchIntentMessages(
  request: SearchIntentRequest,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: buildSearchIntentSystemPrompt() },
    {
      role: 'user',
      content: JSON.stringify({
        title: request.title,
        scenes: request.scenes.map((scene) => ({
          sceneId: scene.sceneId,
          sentences: scene.text,
          ...(scene.searchText ? { englishSentences: scene.searchText } : {}),
        })),
      }),
    },
  ];
}

function parseSearchIntentContent(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Search intents returned empty content');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new Error('Search intents returned malformed JSON', { cause: error });
  }
}

function searchIntentScenes(
  request: { draft: StoryboardDraft; script: string; searchScript?: string },
  sentences: readonly CanonicalSentence[],
): SearchIntentScene[] | null {
  const contentScenes = request.draft.scenes.filter(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) === null,
  );
  const searchEvidence = request.searchScript
    ? balancedSearchEvidenceGroups(request.searchScript, contentScenes.length)
    : null;
  const scenes: SearchIntentScene[] = [];
  for (const [index, scene] of contentScenes.entries()) {
    const text = canonicalSentenceRangeText(
      request.script,
      sentences,
      scene.startSentenceId,
      scene.endSentenceId,
    )?.trim();
    if (!text) return null;
    const searchText = searchEvidence?.[index]?.trim();
    scenes.push({
      sceneId: scene.sceneId,
      text,
      ...(searchText ? { searchText } : {}),
    });
  }
  return scenes;
}

function parseSearchIntents(
  raw: unknown,
  batch: readonly SearchIntentScene[],
): [string, string[]][] {
  const entries = isRecord(raw) ? raw['scenes'] : raw;
  if (!Array.isArray(entries) || entries.length !== batch.length) {
    throw new Error(`Search intents must cover exactly ${batch.length} scenes`);
  }
  return entries.flatMap((entry, index): [string, string[]][] => {
    const sceneId = batch[index]!.sceneId;
    if (!isRecord(entry) || entry['sceneId'] !== sceneId) {
      throw new Error(`Search intent ${index + 1} must be for ${sceneId}`);
    }
    const intents = sanitizedIntents(entry['imageSearchIntent']);
    return intents.length > 0 ? [[sceneId, intents]] : [];
  });
}

function sanitizedIntents(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const intents: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const intent = raw.replace(/\s+/gu, ' ').trim();
    const key = intent.toLocaleLowerCase('en-US');
    if (
      intent.length < MIN_SEARCH_INTENT_CHARACTERS ||
      intent.length > MAX_SEARCH_INTENT_CHARACTERS ||
      !/[A-Za-z]/u.test(intent) ||
      NON_LATIN_SCRIPT_PATTERN.test(intent) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    intents.push(intent);
    if (intents.length === MAX_SEARCH_INTENTS_PER_SCENE) break;
  }
  return intents;
}

async function mapBatchesWithLimit<T>(
  batches: readonly SearchIntentScene[][],
  limit: number,
  run: (batch: SearchIntentScene[]) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array<T>(batches.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, batches.length) }, async () => {
      while (next < batches.length) {
        const index = next;
        next += 1;
        results[index] = await run(batches[index]!);
      }
    }),
  );
  return results;
}

function sceneBatches(
  scenes: readonly SearchIntentScene[],
  size: number,
): SearchIntentScene[][] {
  const batches: SearchIntentScene[][] = [];
  for (let index = 0; index < scenes.length; index += size) {
    batches.push(scenes.slice(index, index + size));
  }
  return batches;
}

function warnSearchIntentFailure(scope: string, error: unknown): void {
  console.warn(
    `[video-worker] visual:intents ${scope} failed; keeping deterministic search intents`,
    error,
  );
}
