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
import {
  buildVisualSubjectSearchQueries,
  parseVisualSubjectCatalog,
  subjectNames,
  type VisualSceneSubjectAssignment,
  type VisualSubject,
  visualSubjectById,
  type VisualSubjectCatalog,
} from './subject-catalog.js';
import { isGroundedSearchIntent } from './validation.js';

const SEARCH_INTENT_BATCH_SIZE = 14;
const SEARCH_INTENT_BATCH_CONCURRENCY = 3;
const SEARCH_INTENT_MAX_OUTPUT_TOKENS = 2_048;
const SUBJECT_CATALOG_MAX_OUTPUT_TOKENS = 3_072;
const SEARCH_INTENT_REASONING = { enabled: false } as const;
const NON_LATIN_SCRIPT_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK_CHARACTER_CAPTURE_PATTERN =
  /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu;

export interface SearchIntentScene {
  sceneId: string;
  text: string;
  searchText?: string;
}

export interface SearchIntentCatalogRequest {
  title: string;
  scenes: readonly SearchIntentScene[];
  signal?: AbortSignal;
}

export interface SearchIntentRequest extends SearchIntentCatalogRequest {
  subjectCatalog?: VisualSubjectCatalog;
}

export interface SearchIntentProvider {
  readonly model: string;
  /** Optional so pre-v8 injected providers keep the legacy per-scene path. */
  catalog?(request: SearchIntentCatalogRequest): Promise<unknown>;
  suggest(request: SearchIntentRequest): Promise<unknown>;
}

export interface SearchIntentEnrichment {
  draft: StoryboardDraft;
  model: string | null;
  enrichedSceneCount: number;
  entityAnchoredSceneCount: number;
  /** Present on v8 production enrichment. Optional keeps old injected providers
   * and the brand-only no-op result source-compatible. */
  subjectCatalog?: VisualSubjectCatalog | null;
  sceneAssignments?: VisualSceneSubjectAssignment[];
}

interface SceneSuggestion {
  intents: string[];
  entities: string[];
  subjectIds: string[];
}

interface SearchIntentCompletionDiagnostics {
  provider: string;
  model: string;
  finishReason: string;
  reasoningChars: number;
}

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
  if (scenes.length === 0) {
    return {
      draft: request.draft,
      model: null,
      enrichedSceneCount: 0,
      entityAnchoredSceneCount: 0,
    };
  }

  const searchTitle = request.searchTitle?.trim() || request.title;
  const subjectCatalog = provider.catalog
    ? await buildSubjectCatalog(provider, {
        title: searchTitle,
        scenes,
        ...(options.signal ? { signal: options.signal } : {}),
      })
    : null;

  throwIfAborted(options.signal);
  const batchResults = await mapBatchesWithLimit(
    sceneBatches(scenes, SEARCH_INTENT_BATCH_SIZE),
    SEARCH_INTENT_BATCH_CONCURRENCY,
    async (batch) => {
      throwIfAborted(options.signal);
      try {
        const raw = await provider.suggest({
          title: searchTitle,
          scenes: batch,
          ...(subjectCatalog ? { subjectCatalog } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        });
        return parseSearchIntents(raw, batch, subjectCatalog);
      } catch (error) {
        throwIfAborted(options.signal);
        throw new Error(
          `Search intents failed for the batch starting at ${batch[0]?.sceneId ?? 'no scene'}: ${errorMessage(error)}`,
          { cause: error },
        );
      }
    },
  );

  const suggested = new Map<string, SceneSuggestion>();
  for (const entries of batchResults) {
    for (const [sceneId, suggestion] of entries) {
      suggested.set(sceneId, suggestion);
    }
  }

  const evidenceBySceneId = new Map(
    scenes.map((scene) => [scene.sceneId, scene] as const),
  );
  const contentSceneIds = new Set(scenes.map((scene) => scene.sceneId));
  const firstContentSceneId = scenes[0]?.sceneId;
  const assignments: VisualSceneSubjectAssignment[] = [];
  const unenrichedSceneIds: string[] = [];
  let entityAnchoredSceneCount = 0;
  let lastDirectSubjectIds: string[] = [];

  const enrichedScenes = request.draft.scenes.map((scene) => {
    if (podcastBrandVisualKind(scene.imageSearchIntent)) return scene;
    const evidence = evidenceBySceneId.get(scene.sceneId);
    const suggestion = suggested.get(scene.sceneId);
    const grounded = (suggestion?.intents ?? []).filter((intent) =>
      isGroundedSearchIntent(intent, evidence?.text ?? ''),
    );
    const entities = groundedEntities(suggestion?.entities ?? [], evidence);
    if (entities.length > 0) entityAnchoredSceneCount += 1;

    if (!subjectCatalog) {
      if (grounded.length === 0) {
        unenrichedSceneIds.push(scene.sceneId);
        return scene;
      }
      return {
        ...scene,
        imageSearchIntent: grounded,
        ...(entities.length > 0 ? { imageSearchEntities: entities } : {}),
      };
    }

    const directSubjectIds = groundedSubjectIds(
      suggestion?.subjectIds ?? [],
      subjectCatalog,
      evidence,
    );
    let subjectIds: string[];
    let selectionReason: VisualSceneSubjectAssignment['selectionReason'];

    if (scene.sceneId === firstContentSceneId) {
      subjectIds = [subjectCatalog.primarySubjectId];
      selectionReason = directSubjectIds.includes(
        subjectCatalog.primarySubjectId,
      )
        ? 'direct'
        : 'episode-context';
    } else if (directSubjectIds.length > 0) {
      subjectIds = directSubjectIds;
      selectionReason = 'direct';
    } else if (lastDirectSubjectIds.length > 0) {
      subjectIds = lastDirectSubjectIds.slice(0, 2);
      selectionReason = 'section-context';
    } else {
      subjectIds = [subjectCatalog.primarySubjectId];
      selectionReason = 'episode-context';
    }

    if (directSubjectIds.length > 0) lastDirectSubjectIds = directSubjectIds;
    assignments.push({ sceneId: scene.sceneId, subjectIds, selectionReason });

    const catalogIntents = subjectIds
      .flatMap((subjectId) => {
        const subject = visualSubjectById(subjectCatalog, subjectId);
        return subject ? buildVisualSubjectSearchQueries(subject) : [];
      })
      .filter((intent) =>
        isGroundedSearchIntent(intent, evidence?.text ?? ''),
      )
      .slice(0, MAX_SEARCH_INTENTS_PER_SCENE);
    if (catalogIntents.length === 0) {
      unenrichedSceneIds.push(scene.sceneId);
      return scene;
    }
    return {
      ...scene,
      imageSearchIntent: catalogIntents,
      ...(entities.length > 0 ? { imageSearchEntities: entities } : {}),
    };
  });

  if (assignments.length > 0 && assignments.length !== contentSceneIds.size) {
    throw new Error(
      `Visual subject catalog assigned ${assignments.length} of ${contentSceneIds.size} content scenes`,
    );
  }
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
    subjectCatalog,
    sceneAssignments: assignments,
  };
}

async function buildSubjectCatalog(
  provider: SearchIntentProvider,
  request: SearchIntentCatalogRequest,
): Promise<VisualSubjectCatalog> {
  if (!provider.catalog) {
    throw new Error('Visual subject catalog provider is not configured');
  }
  try {
    const raw = await provider.catalog(request);
    const catalog = parseVisualSubjectCatalog(raw);
    validateSubjectCatalogGrounding(catalog, request);
    return catalog;
  } catch (error) {
    throwIfAborted(request.signal);
    throw new Error(`Visual subject catalog failed: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

function validateSubjectCatalogGrounding(
  catalog: VisualSubjectCatalog,
  request: SearchIntentCatalogRequest,
): void {
  const scenesById = new Map(
    request.scenes.map((scene) => [scene.sceneId, scene] as const),
  );
  const wholeEpisodeEvidence = normalizedEntityText(
    `${request.title}\n${request.scenes
      .map((scene) => `${scene.text}\n${scene.searchText ?? ''}`)
      .join('\n')}`,
  );
  for (const subject of catalog.subjects) {
    if (
      !subjectNames(subject).some((name) =>
        containsEntityPhrase(wholeEpisodeEvidence, normalizedEntityText(name)),
      )
    ) {
      throw new Error(
        `Visual subject ${subject.id} (${subjectNames(subject).join(' / ')}) is not grounded in the episode`,
      );
    }
    for (const sceneId of subject.evidenceSceneIds) {
      if (!scenesById.has(sceneId)) {
        throw new Error(
          `Visual subject ${subject.id} cites unknown evidence scene ${sceneId}`,
        );
      }
    }
  }
}

function groundedSubjectIds(
  subjectIds: readonly string[],
  catalog: VisualSubjectCatalog,
  scene: SearchIntentScene | undefined,
): string[] {
  if (!scene) return [];
  const seen = new Set<string>();
  const grounded: string[] = [];
  for (const subjectId of subjectIds) {
    if (seen.has(subjectId)) continue;
    const subject = visualSubjectById(catalog, subjectId);
    if (!subject || !subjectAppearsInScene(subject, scene)) continue;
    seen.add(subjectId);
    grounded.push(subjectId);
    if (grounded.length === MAX_SEARCH_ENTITIES_PER_SCENE) break;
  }
  return grounded;
}

function subjectAppearsInScene(
  subject: VisualSubject,
  scene: SearchIntentScene,
): boolean {
  const evidence = normalizedEntityText(
    `${scene.text}\n${scene.searchText ?? ''}`,
  );
  return subjectNames(subject).some((name) =>
    containsEntityPhrase(evidence, normalizedEntityText(name)),
  );
}

function groundedEntities(
  entities: readonly string[],
  scene: SearchIntentScene | undefined,
): string[] {
  if (!scene) return [];
  const evidence = normalizedEntityText(
    `${scene.text}\n${scene.searchText ?? ''}`,
  );
  return entities.filter((entity) =>
    containsEntityPhrase(evidence, normalizedEntityText(entity)),
  );
}

function containsEntityPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function normalizedEntityText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(CJK_CHARACTER_CAPTURE_PATTERN, ' $1 ')
    .replace(/\s+/gu, ' ')
    .trim();
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
    catalog: (request) =>
      completeSearchIntentRequest({
        openai,
        model,
        messages: subjectCatalogMessages(request),
        maxTokens: SUBJECT_CATALOG_MAX_OUTPUT_TOKENS,
        operation: 'buildVisualSubjectCatalog',
        signal: request.signal,
      }),
    suggest: (request) =>
      completeSearchIntentRequest({
        openai,
        model,
        messages: searchIntentMessages(request),
        maxTokens: SEARCH_INTENT_MAX_OUTPUT_TOKENS,
        operation: 'suggestSearchIntents',
        signal: request.signal,
      }),
  };
}

async function completeSearchIntentRequest(input: {
  openai: OpenAI;
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  maxTokens: number;
  operation: 'buildVisualSubjectCatalog' | 'suggestSearchIntents';
  signal?: AbortSignal;
}): Promise<unknown> {
  const completion = await createCompletionWithRetry(
    input.openai,
    {
      model: input.model,
      messages: input.messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: input.maxTokens,
    },
    null,
    input.operation,
    {
      ...(input.signal ? { signal: input.signal } : {}),
      reasoning: SEARCH_INTENT_REASONING,
    },
  );
  const choice = completion.choices[0];
  return parseSearchIntentContent(choice?.message?.content ?? '', {
    provider: completion.provider || 'unknown',
    model: completion.model || input.model,
    finishReason: choice?.finish_reason || 'unknown',
    reasoningChars: searchIntentReasoningCharacterCount(choice?.message),
  });
}

export function buildSubjectCatalogSystemPrompt(): string {
  return [
    'Build the visual subject catalog for this entire news episode.',
    '- Include only named real-world subjects that the supplied title or scenes actually mention: companies, people, products, protocols, places, regulators, assets, standards, or organizations.',
    '- Pick exactly one primary subject: the actor or thing the headline/story is principally about, not a competitor that appears later.',
    '- canonicalName and aliases are identity labels. Do not merge competitors or similarly named things.',
    '- Copy canonicalName verbatim from the title or scenes. When both an English and a local-script name are present, use the English spelling for canonicalName and put the local-script spelling in aliases. Put descriptive industry, category, and role terms only in identityHints.',
    '- searchQueries must be English news-photo queries and must contain the canonicalName or one alias plus concrete identity context.',
    '- identityHints are 2 to 6 short positive disambiguators such as industry, product, chain, role, or location. They must describe this identity, not a generic mood.',
    '- negativeHints are only known name-collision meanings to reject (for example animal, camera, engine); do not list ordinary competitors as negative hints.',
    '- officialDomains may be included only when a domain is explicitly present in the supplied evidence; otherwise return [].',
    '- evidenceSceneIds must cite scenes where the subject is actually named.',
    '- Use stable IDs shaped like subject-coinbase or subject-jesse-pollak.',
    'Return valid JSON only: {"primarySubjectId":"subject-coinbase","subjects":[{"id":"subject-coinbase","canonicalName":"Coinbase","type":"company","aliases":[],"storyRole":"primary","evidenceSceneIds":["scene-01"],"searchQueries":["Coinbase tokenized stocks"],"identityHints":["crypto exchange","Base"],"negativeHints":[],"officialDomains":[]}]}',
  ].join('\n');
}

export function buildSearchIntentSystemPrompt(): string {
  return [
    'Map every storyboard scene onto the supplied episode-wide visual subject catalog.',
    '- Start with proper nouns: companies, products, organizations, people, places, protocols, regulators, assets, and standards.',
    "- Use only names written in that scene's own sentences. Never invent a name and never carry one from another scene.",
    '- Never write a number, date, share, or amount that is not already written in that scene.',
    '- Return subjectIds only for catalog subjects literally named in that scene.',
    '- Only when a scene names nothing at all, return an empty subjectIds list. The application will choose the contextual subject fallback; if imageSearchIntent needs an audit phrase, describe what a camera could see from the concrete wording already present.',
    '- Never invent generic stock-photo metaphors such as financial risk concept, liquidity concept, teamwork, handshake, or futuristic interface.',
    '- Repeat locally written proper nouns in entities, spelled exactly as the scene writes them. Return [] when it names none.',
    '- Each phrase must be English only, 2 to 8 words, and at most 80 characters.',
    '- Return every scene once, in order, with the original sceneId.',
    'Return valid JSON only with a "scenes" array: {"scenes":[{"sceneId":"scene-01","subjectIds":["subject-coinbase"],"imageSearchIntent":["Coinbase tokenized stocks"],"entities":["Coinbase"]}]}',
  ].join('\n');
}

function subjectCatalogMessages(
  request: SearchIntentCatalogRequest,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return promptMessages(buildSubjectCatalogSystemPrompt(), {
    title: request.title,
    scenes: promptScenes(request.scenes),
  });
}

function searchIntentMessages(
  request: SearchIntentRequest,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return promptMessages(buildSearchIntentSystemPrompt(), {
    title: request.title,
    ...(request.subjectCatalog
      ? { subjectCatalog: request.subjectCatalog }
      : {}),
    scenes: promptScenes(request.scenes),
  });
}

function promptScenes(scenes: readonly SearchIntentScene[]): unknown[] {
  return scenes.map((scene) => ({
    sceneId: scene.sceneId,
    sentences: scene.text,
    ...(scene.searchText ? { englishSentences: scene.searchText } : {}),
  }));
}

function promptMessages(
  systemPrompt: string,
  payload: Record<string, unknown>,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify(payload),
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

function parseSearchIntents(
  raw: unknown,
  batch: readonly SearchIntentScene[],
  catalog: VisualSubjectCatalog | null,
): [string, SceneSuggestion][] {
  const entries = isRecord(raw) ? raw['scenes'] : raw;
  if (!Array.isArray(entries)) {
    throw new Error('Search intents must be an array of scenes');
  }
  const requested = new Set(batch.map((scene) => scene.sceneId));
  const catalogIds = new Set(
    catalog?.subjects.map((subject) => subject.id) ?? [],
  );
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
    const subjectIds = Array.isArray(entry['subjectIds'])
      ? entry['subjectIds']
          .filter(
            (value): value is string =>
              typeof value === 'string' && catalogIds.has(value),
          )
          .slice(0, MAX_SEARCH_ENTITIES_PER_SCENE)
      : [];
    parsed.set(sceneId, {
      intents,
      entities: sanitizedPhrases(
        entry['entities'],
        MAX_SEARCH_ENTITIES_PER_SCENE,
      ),
      subjectIds: [...new Set(subjectIds)],
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
