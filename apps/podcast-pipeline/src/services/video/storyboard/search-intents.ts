import type OpenAI from 'openai';

import { errorMessage } from '../../../lib/errorMessage.js';
import { isRecord } from '../../../lib/typeGuards.js';
import { createCompletionWithRetry, getOpenRouterConfig } from '../../llm.js';
import {
  podcastBrandVisualKind,
  splitPodcastVisualSections,
} from '../../podcast-packaging.js';
import { throwIfAborted } from '../abort.js';
import {
  MAX_SEARCH_ENTITIES_PER_SCENE,
  MAX_SEARCH_INTENTS_PER_SCENE,
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
  visualSubjectById,
  type VisualSubjectCatalog,
} from './subject-catalog.js';

const SUBJECT_CATALOG_MAX_OUTPUT_TOKENS = 3_072;
const SEARCH_INTENT_REASONING = { enabled: false } as const;
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

export interface SearchIntentProvider {
  readonly model: string;
  catalog(request: SearchIntentCatalogRequest): Promise<unknown>;
}

export interface SearchIntentEnrichment {
  draft: StoryboardDraft;
  model: string | null;
  enrichedSceneCount: number;
  entityAnchoredSceneCount: number;
  subjectCatalog: VisualSubjectCatalog | null;
  sceneAssignments: VisualSceneSubjectAssignment[];
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
      subjectCatalog: null,
      sceneAssignments: [],
    };
  }

  const searchTitle = request.searchTitle?.trim() || request.title;
  const subjectCatalog = await buildSubjectCatalog(provider, {
    title: searchTitle,
    scenes,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  return enrichFromSubjectCatalog(
    request.draft,
    scenes,
    subjectCatalog,
    provider.model,
  );
}

function enrichFromSubjectCatalog(
  draft: StoryboardDraft,
  scenes: readonly SearchIntentScene[],
  catalog: VisualSubjectCatalog,
  model: string,
): SearchIntentEnrichment {
  const contentSceneIds = new Set(scenes.map((scene) => scene.sceneId));
  const directByScene = new Map<string, string[]>();
  for (const subject of catalog.subjects) {
    for (const sceneId of subject.evidenceSceneIds) {
      if (!contentSceneIds.has(sceneId)) continue;
      const current = directByScene.get(sceneId) ?? [];
      if (!current.includes(subject.id)) current.push(subject.id);
      directByScene.set(sceneId, current);
    }
  }

  const firstContentSceneId = scenes[0]?.sceneId;
  let lastDirectSubjectIds: string[] = [];
  const assignments: VisualSceneSubjectAssignment[] = [];
  let entityAnchoredSceneCount = 0;

  const enrichedScenes = draft.scenes.map((scene) => {
    if (podcastBrandVisualKind(scene.imageSearchIntent)) return scene;
    const directSubjectIds = (directByScene.get(scene.sceneId) ?? []).slice(
      0,
      MAX_SEARCH_ENTITIES_PER_SCENE,
    );
    let subjectIds: string[];
    let selectionReason: VisualSceneSubjectAssignment['selectionReason'];

    if (scene.sceneId === firstContentSceneId) {
      subjectIds = [catalog.primarySubjectId];
      selectionReason = directSubjectIds.includes(catalog.primarySubjectId)
        ? 'direct'
        : 'episode-context';
    } else if (directSubjectIds.length > 0) {
      subjectIds = directSubjectIds;
      selectionReason = 'direct';
    } else if (lastDirectSubjectIds.length > 0) {
      subjectIds = lastDirectSubjectIds.slice(0, 2);
      selectionReason = 'section-context';
    } else {
      subjectIds = [catalog.primarySubjectId];
      selectionReason = 'episode-context';
    }

    if (directSubjectIds.length > 0) lastDirectSubjectIds = directSubjectIds;
    assignments.push({ sceneId: scene.sceneId, subjectIds, selectionReason });

    const subjects = subjectIds.flatMap((subjectId) => {
      const subject = visualSubjectById(catalog, subjectId);
      return subject ? [subject] : [];
    });
    const imageSearchIntent = [
      ...new Set(subjects.flatMap(buildVisualSubjectSearchQueries)),
    ].slice(0, MAX_SEARCH_INTENTS_PER_SCENE);
    const imageSearchEntities = subjects.map(
      (subject) => subject.canonicalName,
    );
    if (imageSearchEntities.length > 0) entityAnchoredSceneCount += 1;
    return {
      ...scene,
      imageSearchIntent,
      ...(imageSearchEntities.length > 0 ? { imageSearchEntities } : {}),
    };
  });

  // The storyboard structure was already validated before enrichment. This pass
  // only swaps its image-search metadata for catalog-derived identity data;
  // numeric grounding is deliberately not re-applied because numbers embedded
  // in proper names such as a16z, web3 or GPT-5 are identity, not factual claims.
  return {
    draft: { scenes: enrichedScenes },
    model,
    enrichedSceneCount: scenes.length,
    entityAnchoredSceneCount,
    subjectCatalog: catalog,
    sceneAssignments: assignments,
  };
}

async function buildSubjectCatalog(
  provider: SearchIntentProvider,
  request: SearchIntentCatalogRequest,
): Promise<VisualSubjectCatalog> {
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
  };
}

async function completeSearchIntentRequest(input: {
  openai: OpenAI;
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  maxTokens: number;
  operation: 'buildVisualSubjectCatalog';
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
    '- searchQueries are the final image-search queries. Keep them short, concrete, and identity-first; include the canonicalName or one alias plus only the context needed to disambiguate the subject.',
    '- identityHints are 2 to 6 short positive disambiguators such as industry, product, chain, role, or location. They must describe this identity, not a generic mood.',
    '- negativeHints are only known name-collision meanings to reject (for example animal, camera, engine); do not list ordinary competitors as negative hints.',
    '- officialDomains may be included only when a domain is explicitly present in the supplied evidence; otherwise return [].',
    "- evidenceSceneIds must cite scenes where the subject is actually named. These IDs are the application's direct scene assignment; do not cite a scene merely because the subject would make a good illustration.",
    '- Use stable IDs shaped like subject-coinbase or subject-jesse-pollak.',
    'Return valid JSON only: {"primarySubjectId":"subject-coinbase","subjects":[{"id":"subject-coinbase","canonicalName":"Coinbase","type":"company","aliases":[],"storyRole":"primary","evidenceSceneIds":["scene-01"],"searchQueries":["Coinbase"],"identityHints":["crypto exchange","Base"],"negativeHints":[],"officialDomains":[]}]}',
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
