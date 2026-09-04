import OpenAI, { APIError } from 'openai';

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
  isGenericVisualSubjectName,
  parseVisualSubjectCatalog,
  subjectNames,
  VISUAL_SUBJECT_TYPES,
  type VisualSceneSubjectAssignment,
  type VisualSubject,
  visualSubjectById,
  type VisualSubjectCatalog,
  type VisualSubjectDrop,
} from './subject-catalog.js';

const SEARCH_INTENT_REASONING = { enabled: false } as const;
const SEARCH_INTENT_PAYLOAD_MAX_ATTEMPTS = 2;
const MAX_DEGRADED_REASON_CHARS = 200;
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
  /**
   * Set when the catalog LLM answered with something unusable. The episode then
   * keeps the deterministic storyboard intents and renders anyway, so this is
   * the only surviving evidence of why its images were never subject-anchored.
   */
  degradedReason?: string;
}

interface SearchIntentCompletionDiagnostics {
  provider: string;
  model: string;
  finishReason: string;
  reasoningChars: number;
}

class SearchIntentPayloadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SearchIntentPayloadError';
  }
}

/**
 * A catalog response that arrived and could not be used. Separating it from the
 * causes that never reached a model is what lets the episode degrade: three
 * fail_episode_video_visual attempts were being burned on one bad LLM answer,
 * replaying the whole storyboard each time, for an episode whose deterministic
 * intents would have rendered.
 */
class SearchIntentQualityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SearchIntentQualityError';
  }
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
  let subjectCatalog: VisualSubjectCatalog;
  try {
    subjectCatalog = await buildSubjectCatalog(provider, {
      title: searchTitle,
      scenes,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (!(error instanceof SearchIntentQualityError)) throw error;
    return {
      draft: request.draft,
      model: provider.model,
      enrichedSceneCount: 0,
      entityAnchoredSceneCount: 0,
      subjectCatalog: null,
      sceneAssignments: [],
      degradedReason: degradedCatalogReason(error),
    };
  }

  return enrichFromSubjectCatalog(
    request.draft,
    scenes,
    subjectCatalog,
    provider.model,
  );
}

function degradedCatalogReason(error: unknown): string {
  const collapsed = errorMessage(error).replace(/\s+/gu, ' ').trim();
  const reason = collapsed || 'visual subject catalog response was unusable';
  return reason.length > MAX_DEGRADED_REASON_CHARS
    ? `${reason.slice(0, MAX_DEGRADED_REASON_CHARS - 1)}…`
    : reason;
}

/**
 * Whether the catalog call failed before any model answered it. Such a cause
 * leaves no response to degrade to, and an abort is the render being cancelled,
 * so all of them still fail the episode.
 *
 * The SDK is identified by type, never by `error.name`: every one of its error
 * classes inherits the plain 'Error' name, so a name test silently misses a
 * DNS/TLS/socket failure and a request timeout — `APIConnectionError` and
 * `APIConnectionTimeoutError` — and those are exactly the ones that also carry
 * no numeric `status`. Reclassifying them as a bad model answer would degrade an
 * episode to unanchored intents on a network blip. The numeric-status branch
 * still covers a non-SDK provider that only reports an HTTP status, and the two
 * name checks cover a DOMException abort and a non-SDK timeout.
 */
function isUpstreamCatalogError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (error instanceof APIError) return true;
  if (typeof (error as { status?: unknown }).status === 'number') return true;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

function enrichFromSubjectCatalog(
  draft: StoryboardDraft,
  scenes: readonly SearchIntentScene[],
  catalog: VisualSubjectCatalog,
  model: string,
): SearchIntentEnrichment {
  const contentSceneIds = new Set(scenes.map((scene) => scene.sceneId));
  const directByScene = new Map<string, string[]>();
  // A scene's first subject is the query Brave is asked, and the entity cap
  // trims from the back, so a person the scene names must come before the
  // company it also names: "Andy Jassy" finds his photo, "Amazon" finds a
  // warehouse. Stable sort keeps the catalog's own order among equals.
  const personFirstSubjects = [...catalog.subjects].sort(
    (left, right) =>
      Number(right.type === 'person') - Number(left.type === 'person'),
  );
  for (const subject of personFirstSubjects) {
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
    const imageSearchEntities = sceneSearchEntities(subjects);
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

/**
 * The names a scene's candidates are ranked against, for both the enriched draft
 * and the plan-time rebuild. Disambiguation moves the episode's own spelling of
 * an ambiguous subject into `aliases[0]` and puts a contextual phrase in
 * `canonicalName` ('venture capital a16z'), but a Brave result's alt text or URL
 * carries the short original — so scoring on the canonical name alone awarded a
 * zero bonus to every candidate of exactly the subjects disambiguation runs on.
 * Canonical names come first so the cap, which the persisted plan also enforces,
 * takes the demoted originals away rather than a whole subject's identity.
 */
export function sceneSearchEntities(
  subjects: readonly VisualSubject[],
): string[] {
  const seen = new Set<string>();
  const entities: string[] = [];
  for (const name of [
    ...subjects.map((subject) => subject.canonicalName),
    ...subjects.flatMap((subject) => subject.aliases.slice(0, 1)),
  ]) {
    const key = name.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push(name);
  }
  return entities.slice(0, MAX_SEARCH_ENTITIES_PER_SCENE);
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
    if (isUpstreamCatalogError(error)) throw error;
    throw new SearchIntentQualityError(
      `Visual subject catalog failed: ${errorMessage(error)}`,
      { cause: error },
    );
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
    catalog: async (request) => {
      for (
        let attempt = 1;
        attempt <= SEARCH_INTENT_PAYLOAD_MAX_ATTEMPTS;
        attempt += 1
      ) {
        try {
          const raw = await completeSearchIntentRequest({
            openai,
            model,
            messages: subjectCatalogMessages(request),
            operation: 'buildVisualSubjectCatalog',
            signal: request.signal,
          });
          return materializeVisualSubjectCatalog(raw, request);
        } catch (error) {
          throwIfAborted(request.signal);
          if (
            !(error instanceof SearchIntentPayloadError) ||
            attempt === SEARCH_INTENT_PAYLOAD_MAX_ATTEMPTS
          ) {
            throw error;
          }
        }
      }
      throw new Error('Search intent payload retry loop exhausted');
    },
  };
}

async function completeSearchIntentRequest(input: {
  openai: OpenAI;
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
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

interface CompactSubjectEvidence {
  requestedPrimaryId: string;
  wholeEpisodeEvidence: string;
  scenes: { sceneId: string; text: string }[];
}

type CompactSubjectVerdict =
  | { kept: Record<string, unknown> }
  | { drop: VisualSubjectDrop };

/**
 * The unit of failure is the subject, never the catalog. One hallucinated
 * "subject-macron" used to throw the whole catalog away and send 64 scenes to
 * "AI engineers monitoring data center servers photo"; now it is dropped and
 * recorded while every grounded visual anchor still anchors its scenes.
 */
function materializeVisualSubjectCatalog(
  input: unknown,
  request: SearchIntentCatalogRequest,
): unknown {
  if (
    !isRecord(input) ||
    typeof input['primarySubjectId'] !== 'string' ||
    !Array.isArray(input['subjects'])
  ) {
    return input;
  }
  const requestedPrimaryId = input['primarySubjectId'];
  const evidence: CompactSubjectEvidence = {
    requestedPrimaryId,
    wholeEpisodeEvidence: normalizedEntityText(
      `${request.title}\n${request.scenes
        .map((scene) => `${scene.text}\n${scene.searchText ?? ''}`)
        .join('\n')}`,
    ),
    scenes: request.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      text: normalizedEntityText(`${scene.text}\n${scene.searchText ?? ''}`),
    })),
  };

  const dropped: VisualSubjectDrop[] = [];
  const kept: Record<string, unknown>[] = [];
  const passthrough: unknown[] = [];
  for (const subject of input['subjects'] as unknown[]) {
    if (!isRecord(subject)) {
      passthrough.push(subject);
      continue;
    }
    const verdict = judgeCompactSubject(subject, evidence);
    if ('drop' in verdict) dropped.push(verdict.drop);
    else kept.push(verdict.kept);
  }

  if (kept.length === 0 && passthrough.length === 0) {
    throw new SearchIntentPayloadError(
      `Visual subject catalog kept no grounded visual anchor (dropped ${dropped
        .map((entry) => `${entry.id}=${entry.reason}`)
        .join(', ')})`,
    );
  }

  const primarySubjectId = repairedPrimarySubjectId(kept, requestedPrimaryId);
  return {
    ...input,
    primarySubjectId,
    subjects: [
      ...kept.map((subject) => withStoryRole(subject, primarySubjectId)),
      ...passthrough,
    ],
    ...(dropped.length > 0 ? { droppedSubjects: dropped } : {}),
  };
}

function judgeCompactSubject(
  subject: Record<string, unknown>,
  evidence: CompactSubjectEvidence,
): CompactSubjectVerdict {
  const id = typeof subject['id'] === 'string' ? subject['id'] : 'unknown';
  const type =
    typeof subject['type'] === 'string' ? subject['type'] : 'unknown';
  const names = rawSubjectNames(subject);
  const canonicalName = names[0]?.trim() ?? '';

  const identityDrop = identityDropReason(canonicalName, type);
  if (identityDrop) return dropVerdict(id, names, type, identityDrop);

  // A generic alias ("AI" on NVIDIA) would let the category word ground and
  // rank the subject; the identity keeps only its real names.
  const aliases = names
    .slice(1)
    .filter((alias) => !isGenericVisualSubjectName(alias));
  const groundedNames = [canonicalName, ...aliases];
  const grounded = groundedNames.some((name) =>
    containsEntityPhrase(
      evidence.wholeEpisodeEvidence,
      normalizedEntityText(name),
    ),
  );
  if (!grounded) return dropVerdict(id, names, type, 'not-grounded');

  const evidenceSceneIds = evidence.scenes
    .filter((scene) =>
      groundedNames.some((name) =>
        containsEntityPhrase(scene.text, normalizedEntityText(name)),
      ),
    )
    .map((scene) => scene.sceneId);

  // A secondary subject that exists only in the title cannot directly anchor
  // any scene, so keep the final catalog focused on identities the renderer
  // can actually assign. The primary title subject remains because the first
  // content scene is the episode cover/lead and already falls back to it.
  if (evidenceSceneIds.length === 0 && id !== evidence.requestedPrimaryId) {
    return dropVerdict(id, names, type, 'title-only-no-scene-evidence');
  }

  return {
    kept: {
      ...subject,
      aliases,
      evidenceSceneIds,
      searchQueries: deterministicSubjectSearchQueries(subject),
      officialDomains: [],
    },
  };
}

function identityDropReason(
  canonicalName: string,
  type: string,
): VisualSubjectDrop['reason'] | null {
  if (!canonicalName) return 'missing-canonical-name';
  if (!(VISUAL_SUBJECT_TYPES as readonly string[]).includes(type)) {
    return 'invalid-type';
  }
  if (type === 'other') return 'type-other';
  if (isGenericVisualSubjectName(canonicalName)) return 'generic-term';
  return null;
}

function dropVerdict(
  id: string,
  names: string[],
  type: string,
  reason: VisualSubjectDrop['reason'],
): CompactSubjectVerdict {
  return { drop: { id, names: names.slice(0, 7), type, reason } };
}

/**
 * The model's primary may have been the subject that was dropped. The lead
 * scene still needs an anchor, so the surviving subject with the most scene
 * evidence takes the role rather than failing the catalog on the schema rule
 * that exactly one primary exists.
 */
function repairedPrimarySubjectId(
  kept: readonly Record<string, unknown>[],
  requestedPrimaryId: string,
): string {
  if (kept.some((subject) => subject['id'] === requestedPrimaryId)) {
    return requestedPrimaryId;
  }
  const promoted = [...kept].sort(
    (left, right) => evidenceCount(right) - evidenceCount(left),
  )[0];
  const promotedId = promoted?.['id'];
  return typeof promotedId === 'string' ? promotedId : requestedPrimaryId;
}

function withStoryRole(
  subject: Record<string, unknown>,
  primarySubjectId: string,
): Record<string, unknown> {
  if (subject['id'] === primarySubjectId) {
    return { ...subject, storyRole: 'primary' };
  }
  if (subject['storyRole'] === 'primary') {
    return { ...subject, storyRole: 'secondary' };
  }
  return subject;
}

function evidenceCount(subject: Record<string, unknown>): number {
  const evidence = subject['evidenceSceneIds'];
  return Array.isArray(evidence) ? evidence.length : 0;
}

function rawSubjectNames(subject: Record<string, unknown>): string[] {
  const canonicalName = subject['canonicalName'];
  const aliases = subject['aliases'];
  return [
    ...(typeof canonicalName === 'string' ? [canonicalName] : []),
    ...(Array.isArray(aliases)
      ? aliases.filter((alias): alias is string => typeof alias === 'string')
      : []),
  ];
}

function deterministicSubjectSearchQueries(
  subject: Record<string, unknown>,
): string[] {
  const canonicalName = subject['canonicalName'];
  if (typeof canonicalName !== 'string' || !canonicalName.trim()) return [];
  const canonical = canonicalName.trim();
  const identityHints = compactStringArray(subject['identityHints']);
  const negativeHints = compactStringArray(subject['negativeHints']);
  const compact = canonical.replace(/[^\p{L}\p{N}]/gu, '');
  const ambiguous =
    negativeHints.length > 0 ||
    compact.length <= 4 ||
    /^[a-z]+\d+$/i.test(compact);
  const hint = identityHints[0]?.trim();
  const descriptive =
    ambiguous && hint ? `${canonical} ${hint}`.slice(0, 80).trim() : canonical;
  return [...new Set([descriptive, canonical])];
}

function compactStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'string') return [];
    const trimmed = entry.trim();
    return trimmed ? [trimmed] : [];
  });
}

export function buildSubjectCatalogSystemPrompt(): string {
  return [
    'Build a compact visual anchor catalog for this entire news episode. The catalog drives image search for a news video, so every anchor must point to something that can produce recognizable, story-relevant photographs or logos.',
    '- Prefer concrete named entities that the supplied title or scenes explicitly mention: people; companies or organizations; products, models, protocols or tools; government agencies, regulators or institutions; brands; named places; and named assets.',
    '- Recognizable named places remain valid visual anchors even when the prose uses them metonymically. Wall Street, the White House, 中南海, and Silicon Valley are useful because image search returns a distinctive real place rather than generic stock art.',
    '- Also include an unnamed concrete physical subject or setting when it is materially central to the story or scene, not merely mentioned. Examples include a GPU, data center, server rack, semiconductor fab, robot, mining rig, vehicle, or other photographable object. Use type "object" for these common-noun physical anchors.',
    '- NEVER create an anchor from a broad abstract category merely because it appears in the text. Forbidden examples: AI, artificial intelligence, technology, tech giants, startups, founders, office, investors, markets, innovation, governance, engineers, business, finance, debt, bonds, CapEx, cloud, crypto, blockchain, infrastructure, or similar concepts with no single recognizable physical subject.',
    '- When a broad word such as "AI" appears, prefer the concrete entity or physical subject named in that context (Anthropic -> Anthropic / Claude; OpenAI -> OpenAI / ChatGPT / GPT / Codex; 輝達 -> NVIDIA; an article specifically about GPU demand may use GPU as an object anchor). If the passage provides no concrete visual anchor, emit no subject for that concept.',
    '- If a scene names a person, that person is usually the strongest anchor because their photo is specific. When several valid anchors appear, keep the ones most relevant to what the scene is actually about rather than every noun in the sentence.',
    '- Pick exactly one primary subject: the named entity or concrete physical subject the headline/story is principally about, not a competitor or incidental object that appears later.',
    '- Use only these type values: company, person, product, protocol, place, regulator, asset, standard, organization, object. Map a brand to company/product/organization as appropriate, and a government institution to regulator/organization/place as appropriate.',
    '- canonicalName and aliases are identity labels. Do not merge competitors or similarly named things.',
    '- Copy canonicalName verbatim from the title or scenes. When both an English and a local-script name are present, use the English spelling for canonicalName and put the local-script spelling in aliases (example: canonicalName "NVIDIA", aliases ["輝達"]). Put descriptive industry, category, role, and physical-context terms only in identityHints.',
    '- identityHints are 2 to 6 short positive disambiguators such as industry, product, chain, role, location, or physical context. They must help image search identify this anchor, not describe a generic mood.',
    '- negativeHints are only known name-collision meanings to reject (for example animal, camera, engine); do not list ordinary competitors as negative hints.',
    '- Do not output scene IDs, image-search queries, or domains. The application derives scene evidence and final search queries deterministically from the anchor identity.',
    '- Use stable IDs shaped like subject-nvidia, subject-andy-jassy, or subject-gpu.',
    'Return valid JSON only: {"primarySubjectId":"subject-nvidia","subjects":[{"id":"subject-nvidia","canonicalName":"NVIDIA","type":"company","aliases":["輝達"],"storyRole":"primary","identityHints":["GPU maker","AI chips"],"negativeHints":[]},{"id":"subject-andy-jassy","canonicalName":"Andy Jassy","type":"person","aliases":[],"storyRole":"supporting","identityHints":["Amazon CEO"],"negativeHints":[]},{"id":"subject-gpu","canonicalName":"GPU","type":"object","aliases":[],"storyRole":"supporting","identityHints":["AI accelerator hardware"],"negativeHints":[]}]}',
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
  const suffix = diagnostics
    ? ` (provider=${diagnostics.provider}, model=${diagnostics.model}, finishReason=${diagnostics.finishReason}, reasoningChars=${diagnostics.reasoningChars}, outputChars=${content.length})`
    : '';
  if (!trimmed) {
    throw new SearchIntentPayloadError(
      `Search intents returned empty content${suffix}`,
    );
  }
  if (diagnostics?.finishReason === 'length') {
    throw new SearchIntentPayloadError(
      `Search intents response was truncated${suffix}`,
    );
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new SearchIntentPayloadError(
      `Search intents returned malformed JSON${suffix}`,
      { cause: error },
    );
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
