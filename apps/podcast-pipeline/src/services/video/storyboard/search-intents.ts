import type OpenAI from 'openai';

import { errorMessage } from '../../../lib/errorMessage.js';
import { isRecord } from '../../../lib/typeGuards.js';
import { createCompletionWithRetry, getOpenRouterConfig } from '../../llm.js';
import {
  podcastBrandVisualKind,
  splitPodcastVisualSections,
  validatePodcastStoryboardDraft,
} from '../../podcast-packaging.js';
import { throwIfAborted } from '../abort.js';
import {
  MAX_SEARCH_ENTITIES_PER_SCENE,
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
// completion. A failed batch now fails the whole enrichment, so keep batches
// small enough that one bad completion is cheap for the queue to retry.
const SEARCH_INTENT_BATCH_SIZE = 14;
// Batches are independent completions, so they run in parallel; three at a time
// keeps the burst inside OpenRouter's per-key rate budget.
const SEARCH_INTENT_BATCH_CONCURRENCY = 3;
const SEARCH_INTENT_MAX_OUTPUT_TOKENS = 2_048;
// Search-intent extraction is structured classification, not reasoning. Leaving
// provider-default reasoning enabled lets some DeepSeek endpoints spend the
// whole completion budget in hidden reasoning and return an empty final content
// string, which the visual queue can only see as a generic parse failure.
const SEARCH_INTENT_REASONING = { enabled: false } as const;
// Image search is run against Brave, Pexels and Pixabay, all queried in English.
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
  /** Scenes whose named subjects survived verbatim validation, so image search
   * can anchor on a name instead of a description. The rest are scenes that
   * genuinely name nothing. */
  entityAnchoredSceneCount: number;
}

interface SceneSuggestion {
  intents: string[];
  entities: string[];
}

interface SearchIntentCompletionDiagnostics {
  provider: string;
  model: string;
  finishReason: string;
  reasoningChars: number;
}

/**
 * Replaces the storyboard's search intents with concrete, photographable
 * subjects an LLM read out of each scene.
 *
 * The deterministic table this replaces maps a whole episode onto a handful of
 * canned phrases — every finance or crypto scene asks for the same
 * `blockchain developers office photo` — so the selected images are related to
 * the topic at best and unrelated to the scene at worst. Worse, those phrases
 * are built by transliterating the head of a Chinese sentence, so a scene about
 * "一千五百枚比特幣" searched for `thousand five hundred Bitcoin`, matched a
 * thousand-yard-stare war photo on one filler word, and shipped it.
 *
 * Enrichment is therefore fail-closed, and the unit is the scene, not the
 * episode: every content scene has to come back with at least one grounded
 * phrase, or the whole pass raises. Accepting a partial would put those
 * transliterated phrases back into image search for the scenes that were left
 * out — the exact failure this replaces, only smaller and harder to see. A
 * visual job that cannot enrich is retried by the queue and ends `failed`
 * rather than publishing a video whose images are unrelated to what is said.
 *
 * Each scene also carries back the proper nouns it names, validated verbatim
 * against its own sentences, so image search can require a candidate to be
 * about that subject. A scene that names nothing is legitimate and simply has
 * no entities.
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
  const provider = options.provider ?? createOpenRouterSearchIntentProvider();

  const sentences = splitCanonicalSentences(request.script);
  const scenes = searchIntentScenes(request, sentences);
  if (!scenes) {
    throw new Error(
      'Search intents cannot map every storyboard scene onto canonical sentences',
    );
  }
  // A storyboard of nothing but brand cards has no intent to write; it also
  // cannot happen for a real episode, which always has body scenes.
  if (scenes.length === 0) {
    return {
      draft: request.draft,
      model: null,
      enrichedSceneCount: 0,
      entityAnchoredSceneCount: 0,
    };
  }

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
        // Named by scene so `last_error` says which part of the episode failed.
        throw new Error(
          `Search intents failed for the batch starting at ${batch[0]?.sceneId ?? 'no scene'}: ${errorMessage(error)}`,
          { cause: error },
        );
      }
    },
  );

  // Applied in batch order, so a scene's intents never depend on which request
  // came back first.
  const suggested = new Map<string, SceneSuggestion>();
  for (const entries of batchResults) {
    for (const [sceneId, suggestion] of entries) {
      suggested.set(sceneId, suggestion);
    }
  }

  const evidenceBySceneId = new Map(
    scenes.map((scene) => [scene.sceneId, scene] as const),
  );
  const unenrichedSceneIds: string[] = [];
  let entityAnchoredSceneCount = 0;
  const enrichedScenes = request.draft.scenes.map((scene) => {
    if (podcastBrandVisualKind(scene.imageSearchIntent)) return scene;
    const evidence = evidenceBySceneId.get(scene.sceneId);
    const suggestion = suggested.get(scene.sceneId);
    const grounded = (suggestion?.intents ?? []).filter((intent) =>
      isGroundedSearchIntent(intent, evidence?.text ?? ''),
    );
    if (grounded.length === 0) {
      unenrichedSceneIds.push(scene.sceneId);
      return scene;
    }
    const entities = groundedEntities(suggestion?.entities ?? [], evidence);
    if (entities.length > 0) entityAnchoredSceneCount += 1;
    return {
      ...scene,
      imageSearchIntent: grounded,
      ...(entities.length > 0 ? { imageSearchEntities: entities } : {}),
    };
  });
  if (unenrichedSceneIds.length > 0) {
    throw new Error(
      `Search intents left ${unenrichedSceneIds.length} of ${scenes.length} content scenes without a grounded phrase: ${formatSceneIdList(unenrichedSceneIds)}`,
    );
  }

  const validation = validatePodcastStoryboardDraft(
    request.script,
    { scenes: enrichedScenes },
    request.durationMs,
  );
  if (!validation.success) {
    throw new Error(
      `Search intents left the storyboard invalid: ${validation.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  }

  return {
    draft: validation.draft,
    model: provider.model,
    enrichedSceneCount: scenes.length,
    entityAnchoredSceneCount,
  };
}

/**
 * Entities are matched the way a reader matches them: case- and
 * spacing-insensitive, but verbatim. A model that answers "Ledger" for a scene
 * that only says "Coldcard" loses the invented name instead of anchoring the
 * whole scene's image search on it.
 */
function groundedEntities(
  entities: readonly string[],
  scene: SearchIntentScene | undefined,
): string[] {
  if (!scene) return [];
  const evidence = normalizedEntityText(
    `${scene.text}\n${scene.searchText ?? ''}`,
  );
  return entities.filter((entity) =>
    evidence.includes(normalizedEntityText(entity)),
  );
}

function normalizedEntityText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
}

function formatSceneIdList(sceneIds: readonly string[]): string {
  const shown = sceneIds.slice(0, 5).join(', ');
  return sceneIds.length > 5
    ? `${shown} (+${sceneIds.length - 5} more)`
    : shown;
}

export function createOpenRouterSearchIntentProvider(): SearchIntentProvider {
  const { openai, model } = getOpenRouterConfig({ thinkingModel: null });
  return {
    model,
    async suggest(request) {
      // Transport retries only. A batch that comes back well-formed but useless
      // is retried by the job queue instead: enrichment runs before scraping and
      // image search, so re-running the whole attempt costs seconds, and a
      // second bespoke retry ladder here would only hide how often the model
      // answers badly.
      const completion = await createCompletionWithRetry(
        openai,
        {
          model,
          messages: searchIntentMessages(request),
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: SEARCH_INTENT_MAX_OUTPUT_TOKENS,
        },
        null,
        'suggestSearchIntents',
        {
          ...(request.signal ? { signal: request.signal } : {}),
          reasoning: SEARCH_INTENT_REASONING,
        },
      );
      const choice = completion.choices[0];
      return parseSearchIntentContent(choice?.message?.content ?? '', {
        provider: completion.provider || 'unknown',
        model: completion.model || model,
        finishReason: choice?.finish_reason || 'unknown',
        reasoningChars: searchIntentReasoningCharacterCount(choice?.message),
      });
    },
  };
}

export function buildSearchIntentSystemPrompt(): string {
  return [
    'Choose 1 to 3 image-search phrases for each storyboard scene; each phrase must be English only.',
    '- Start from the proper nouns that scene names: companies, products, organizations, people, places. Turn each into a news-photo query — the named subject plus one or two concrete qualifiers.',
    "- Use only names written in that scene's own sentences. Never carry a name over from another scene and never invent one.",
    '- Repeat those names in "entities", spelled exactly as that scene writes them. Return an empty "entities" list when the scene names nothing.',
    '- Only when a scene names nothing at all, fall back to its most specific photographable subject — describe what a camera could see.',
    '- Each phrase must be 2 to 8 words and at most 80 characters.',
    '- Never write a number, date, share, or amount that is not already written in that scene.',
    '- No narration, headlines, captions, mood, layout, licenses, or URLs.',
    '- Return every scene once, in order, with the original sceneId.',
    'Return valid JSON only: {"scenes":[{"sceneId":"scene-01","imageSearchIntent":["federal reserve building washington"],"entities":["Federal Reserve"]}]}',
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

function parseSearchIntentContent(
  content: string,
  diagnostics?: SearchIntentCompletionDiagnostics,
): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    const suffix = diagnostics
      ? ` (provider=${diagnostics.provider}, model=${diagnostics.model}, finishReason=${diagnostics.finishReason}, reasoningChars=${diagnostics.reasoningChars})`
      : '';
    throw new Error(`Search intents returned empty content${suffix}`);
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new Error('Search intents returned malformed JSON', { cause: error });
  }
}

function searchIntentReasoningCharacterCount(message: unknown): number {
  if (!isRecord(message)) return 0;
  const reasoning = message['reasoning'];
  if (typeof reasoning === 'string') return reasoning.length;
  const details = message['reasoning_details'];
  if (!Array.isArray(details)) return 0;
  return details.reduce<number>((total: number, detail: unknown) => {
    if (!isRecord(detail)) return total;
    const text = detail['text'];
    return total + (typeof text === 'string' ? text.length : 0);
  }, 0);
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
  const sections = splitPodcastVisualSections(request.script);
  const sentenceIndex = new Map(
    sentences.map((sentence) => [sentence.id, sentence.index]),
  );
  const bodyStartIndex = sections.isPackaged
    ? (sections.body[0]?.index ?? 0)
    : 0;
  const bodyEndIndex = sections.isPackaged
    ? (sections.body.at(-1)?.index ?? sentences.length - 1)
    : sentences.length - 1;
  const scenes: SearchIntentScene[] = [];
  for (const [index, scene] of contentScenes.entries()) {
    const startIndex = sentenceIndex.get(scene.startSentenceId);
    const endIndex = sentenceIndex.get(scene.endSentenceId);
    if (startIndex === undefined || endIndex === undefined) return null;
    // Clip evidence to body when packaged: first scene is extended to intro for timing,
    // but its visual semantics must remain BODY ONLY.
    const clippedStart = sections.isPackaged
      ? Math.max(startIndex, bodyStartIndex)
      : startIndex;
    const clippedEnd = sections.isPackaged
      ? Math.min(endIndex, bodyEndIndex)
      : endIndex;
    if (clippedStart > clippedEnd) return null;
    const clippedStartId = sentences[clippedStart]!.id;
    const clippedEndId = sentences[clippedEnd]!.id;
    const text = canonicalSentenceRangeText(
      request.script,
      sentences,
      clippedStartId,
      clippedEndId,
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

/**
 * Reads a batch response by sceneId rather than by position. Demanding an exact
 * same-length, same-order array made one bad entry cost all 14 scenes in the
 * batch their enrichment; matching on the id makes a dropped, reordered,
 * duplicated, or invented scene cost only itself. A batch that names none of
 * the scenes it was asked about is still a failed batch, not a partial one.
 */
function parseSearchIntents(
  raw: unknown,
  batch: readonly SearchIntentScene[],
): [string, SceneSuggestion][] {
  const entries = isRecord(raw) ? raw['scenes'] : raw;
  if (!Array.isArray(entries)) {
    throw new Error('Search intents must be an array of scenes');
  }
  const requested = new Set(batch.map((scene) => scene.sceneId));
  const parsed = new Map<string, SceneSuggestion>();
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const sceneId = entry['sceneId'];
    if (typeof sceneId !== 'string' || !requested.has(sceneId)) continue;
    if (parsed.has(sceneId)) continue;
    const intents = sanitizedPhrases(
      entry['imageSearchIntent'],
      MAX_SEARCH_INTENTS_PER_SCENE,
    );
    if (intents.length === 0) continue;
    parsed.set(sceneId, {
      intents,
      entities: sanitizedPhrases(
        entry['entities'],
        MAX_SEARCH_ENTITIES_PER_SCENE,
      ),
    });
  }
  if (parsed.size === 0) {
    throw new Error(
      `Search intents named none of the ${batch.length} requested scenes`,
    );
  }
  return [...parsed];
}

function sanitizedPhrases(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const phrase = raw.replace(/\s+/gu, ' ').trim();
    const key = phrase.toLocaleLowerCase('en-US');
    if (
      phrase.length < MIN_SEARCH_INTENT_CHARACTERS ||
      phrase.length > MAX_SEARCH_INTENT_CHARACTERS ||
      !/[A-Za-z]/u.test(phrase) ||
      NON_LATIN_SCRIPT_PATTERN.test(phrase) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    phrases.push(phrase);
    if (phrases.length === limit) break;
  }
  return phrases;
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
