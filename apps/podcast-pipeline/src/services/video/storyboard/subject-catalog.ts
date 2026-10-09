import { z } from 'zod';

import { containsShapingTerm } from '../search-vocabulary.js';
import {
  MAX_STORYBOARD_SLIDES,
  MAX_VISUAL_CUE_CHARACTERS,
  SCENE_ID_PATTERN,
} from './draft.js';
import { containsEntityPhrase, englishWords } from './english-text.js';
import {
  cleanSubjectNameField,
  containsExactLetterToken,
  isSingleLetterName,
  isUsableHint,
  isUsableVisualSubjectName,
  SUBJECT_NAME_FIELDS,
  SUBJECT_NAME_REPAIR_KINDS,
  subjectLabel,
  type SubjectNameField,
  type SubjectNameRepair,
  tidyName,
} from './subject-names.js';

export const VISUAL_SUBJECT_TYPES = [
  'company',
  'person',
  'product',
  'protocol',
  'place',
  'regulator',
  'asset',
  'standard',
  'organization',
  'object',
  'other',
] as const;

export const VISUAL_SUBJECT_ROLES = [
  'primary',
  'secondary',
  'supporting',
] as const;

export const VISUAL_SELECTION_REASONS = [
  'direct',
  'model-context',
  'section-context',
  'episode-context',
  'brand',
] as const;

export const MAX_VISUAL_SUBJECTS = 24;
export const SUBJECT_ID_PATTERN = /^subject-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const subjectIdSchema = z.string().regex(SUBJECT_ID_PATTERN);
const sceneIdSchema = z.string().regex(SCENE_ID_PATTERN);
const hintTextSchema = z.string().min(2).max(80);
/**
 * A name is 1–80 characters, and a single character is only ever a one-letter
 * brand such as "X". Everything longer is left to the repair layer, so every
 * two-character string already in a stored catalog still parses.
 */
const nameSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => value.length !== 1 || /^[A-Za-z]$/u.test(value), {
    message: 'a one-character name must be a single ASCII letter',
  });
export const MAX_REPAIRED_SUBJECTS = 48;
const SUBJECT_LIMITS = {
  aliases: 6,
  evidenceSceneIds: MAX_STORYBOARD_SLIDES,
  identityHints: 8,
  negativeHints: 8,
  officialDomains: 4,
  sceneCues: MAX_STORYBOARD_SLIDES,
} as const;

const visualSubjectShape = {
  id: subjectIdSchema,
  canonicalName: nameSchema,
  type: z.enum(VISUAL_SUBJECT_TYPES),
  aliases: z.array(nameSchema).max(SUBJECT_LIMITS.aliases).default([]),
  storyRole: z.enum(VISUAL_SUBJECT_ROLES),
  evidenceSceneIds: z.array(sceneIdSchema).max(SUBJECT_LIMITS.evidenceSceneIds),
  identityHints: z
    .array(hintTextSchema)
    .min(1)
    .max(SUBJECT_LIMITS.identityHints),
  negativeHints: z
    .array(hintTextSchema)
    .max(SUBJECT_LIMITS.negativeHints)
    .default([]),
  officialDomains: z
    .array(
      z
        .string()
        .min(3)
        .max(120)
        .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
    )
    .max(SUBJECT_LIMITS.officialDomains)
    .default([]),
};

export const visualSubjectInputSchema = z
  .object({
    ...visualSubjectShape,
    searchQualifier: z.string().nullable().optional(),
  })
  .strict();

export const visualSubjectSchema = z
  .object({
    ...visualSubjectShape,
    searchQuery: z.string().min(2).max(113),
  })
  .strict()
  .superRefine((subject, context) => {
    const names = subjectNames(subject).sort((a, b) => b.length - a.length);
    const name = names.find((name) =>
      containsEntityPhrase(subject.searchQuery, name),
    );
    const remainder = name
      ? subject.searchQuery
          .replace(new RegExp(escapeRegExp(name), 'iu'), '')
          .trim()
      : null;
    if (
      remainder === null ||
      (remainder !== '' && !isIdentityQualifier(remainder))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['searchQuery'],
        message:
          'searchQuery must contain a subject name and only an identity qualifier',
      });
    } else if (
      remainder === '' &&
      name !== undefined &&
      isSingleLetterName(name)
    ) {
      // A bare one-letter query would send "X" to image search with no identity.
      context.addIssue({
        code: 'custom',
        path: ['searchQuery'],
        message: 'a one-letter name needs an identity qualifier in searchQuery',
      });
    }
  });

export const visualSceneCueSchema = z
  .object({
    sceneId: sceneIdSchema,
    subjectId: subjectIdSchema.nullable(),
    visualCue: z.string().min(2).max(MAX_VISUAL_CUE_CHARACTERS),
  })
  .strict();

/**
 * Why a compact LLM subject never made it into the catalog. One bad subject used
 * to fail the whole catalog and hand every scene to generic B-roll queries, so
 * the drop is recorded instead and the rest of the catalog still anchors images.
 */
export const VISUAL_SUBJECT_DROP_REASONS = [
  'missing-canonical-name',
  'invalid-canonical-name',
  'invalid-type',
  'type-other',
  'generic-term',
  'not-grounded',
  'unsearchable-name',
  'title-only-no-scene-evidence',
] as const;

export const visualSubjectDropSchema = z
  .object({
    id: z.string().min(1).max(80),
    names: z.array(z.string().min(1).max(80)).max(7),
    type: z.string().min(1).max(40),
    reason: z.enum(VISUAL_SUBJECT_DROP_REASONS),
  })
  .strict();

/**
 * One alias or hint the catalog layer removed while the subject it belongs to
 * stayed in the catalog. Diagnostics only: nothing downstream reads it, so it
 * never decides whether a catalog is usable.
 */
const visualSubjectRepairSchema = z
  .object({
    id: z.string().min(1).max(80),
    field: z.enum(SUBJECT_NAME_FIELDS),
    kind: z.enum(SUBJECT_NAME_REPAIR_KINDS),
    value: z.string().max(80),
  })
  .strict();

export const visualSubjectCatalogSchema = z
  .object({
    primarySubjectId: subjectIdSchema,
    subjects: z.array(visualSubjectSchema).min(1).max(MAX_VISUAL_SUBJECTS),
    droppedSubjects: z
      .array(visualSubjectDropSchema)
      .max(MAX_VISUAL_SUBJECTS)
      .optional(),
    repairedSubjects: z
      .array(visualSubjectRepairSchema)
      .max(MAX_REPAIRED_SUBJECTS)
      .optional(),
    sceneCues: z
      .array(visualSceneCueSchema)
      .max(SUBJECT_LIMITS.sceneCues)
      .optional(),
  })
  .strict()
  .superRefine((catalog, context) => {
    const ids = new Set(catalog.subjects.map((subject) => subject.id));
    if (ids.size !== catalog.subjects.length) {
      context.addIssue({
        code: 'custom',
        message: `duplicate subject ids: ${[...ids]
          .filter(
            (id) => catalog.subjects.filter((s) => s.id === id).length > 1,
          )
          .map(
            (id) =>
              `${id} (${catalog.subjects.filter((s) => s.id === id).length}×)`,
          )
          .join(', ')}`,
        path: ['subjects'],
      });
    }
    if (!ids.has(catalog.primarySubjectId)) {
      context.addIssue({
        code: 'custom',
        message: 'Primary visual subject is missing from the catalog',
        path: ['primarySubjectId'],
      });
    }
    const primaryCount = catalog.subjects.filter(
      (subject) => subject.storyRole === 'primary',
    ).length;
    if (primaryCount !== 1) {
      context.addIssue({
        code: 'custom',
        message:
          'Visual subject catalog must contain exactly one primary subject',
        path: ['subjects'],
      });
    }
    const declaredPrimary = catalog.subjects.find(
      (subject) => subject.id === catalog.primarySubjectId,
    );
    if (declaredPrimary?.storyRole !== 'primary') {
      context.addIssue({
        code: 'custom',
        message: 'primarySubjectId must point at the primary story subject',
        path: ['primarySubjectId'],
      });
    }
    for (const [index, subject] of catalog.subjects.entries()) {
      if (
        subject.id !== catalog.primarySubjectId &&
        subject.evidenceSceneIds.length === 0
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Only the title-grounded primary subject may omit scene evidence',
          path: ['subjects', index, 'evidenceSceneIds'],
        });
      }
    }
  });

export const visualSceneSubjectAssignmentSchema = z
  .object({
    sceneId: sceneIdSchema,
    subjectIds: z.array(subjectIdSchema).min(1).max(4),
    selectionReason: z.enum(VISUAL_SELECTION_REASONS),
  })
  .strict();

export type VisualSubject = z.infer<typeof visualSubjectSchema>;
export type VisualSubjectDrop = z.infer<typeof visualSubjectDropSchema>;
export type VisualSceneCue = z.infer<typeof visualSceneCueSchema>;
export type VisualSubjectCatalog = z.infer<typeof visualSubjectCatalogSchema>;

/**
 * Abstract/category phrases that should never become visual anchors. Concrete
 * common nouns are intentionally not denied here: a GPU, data center, server
 * rack, factory, or robot can be a useful image-search anchor when it is the
 * actual subject of a story. The model decides that salience; this set only
 * blocks phrases whose search results are inherently generic or symbolic.
 */
const GENERIC_VISUAL_SUBJECT_TERMS = new Set(
  [
    'ai',
    'artificial intelligence',
    'generative ai',
    'ai infrastructure',
    'ai compute',
    'ai factory',
    'ai factories',
    'ai agents',
    'ai companies',
    'llm',
    'llms',
    'technology',
    'tech',
    'tech giants',
    'tech giant',
    'big tech',
    'startup',
    'startups',
    'founders',
    'office',
    'investors',
    'investor',
    'market',
    'markets',
    'stock market',
    'innovation',
    'engineers',
    'business',
    'finance',
    'financial',
    'hyperscaler',
    'hyperscalers',
    'neocloud',
    'neoclouds',
    'capex',
    'capital expenditure',
    'debt',
    'bond market',
    'bonds',
    'cloud',
    'cloud computing',
    'private credit',
    'pension funds',
    'infrastructure',
    'crypto',
    'cryptocurrency',
    'blockchain',
    'defi',
    'web3',
    'governance',
    'government',
    'regulators',
    'central banks',
    '科技巨頭',
    '科技巨头',
    '人工智慧',
    '人工智能',
    '加密貨幣',
    '加密货币',
    '區塊鏈',
    '区块链',
  ].map(normalized),
);

export function isGenericVisualSubjectName(name: string): boolean {
  return GENERIC_VISUAL_SUBJECT_TERMS.has(normalized(name));
}
export type VisualSceneSubjectAssignment = z.infer<
  typeof visualSceneSubjectAssignmentSchema
>;

export function parseVisualSubjectCatalog(
  input: unknown,
): VisualSubjectCatalog {
  const normalizedInput = normalizeVisualSubjectCatalogInput(input);
  if (
    !isRecord(normalizedInput) ||
    !Array.isArray(normalizedInput['subjects'])
  ) {
    return visualSubjectCatalogSchema.parse(normalizedInput);
  }
  const { subjects } = z
    .object({
      subjects: z
        .array(visualSubjectInputSchema)
        .min(1)
        .max(MAX_VISUAL_SUBJECTS),
    })
    .parse(normalizedInput);
  return visualSubjectCatalogSchema.parse({
    ...normalizedInput,
    subjects: subjects.map((subject) => {
      const { searchQualifier, ...stored } = subject;
      return disambiguateSubjectIdentity({
        ...stored,
        searchQuery: identitySearchQuery(subject, searchQualifier),
      });
    }),
  });
}

/**
 * LLM JSON is not application state yet. Repair bounded, mechanically obvious
 * shape drift before strict validation so one verbose completion cannot burn
 * all three visual attempts for an otherwise valid episode.
 *
 * Aliases and identity hints are cleaned one entry at a time: a value that is
 * not a usable string, or repeats an earlier one, is dropped and recorded in
 * `repairedSubjects`, and the rest of the subject survives. A name is never
 * lengthened, truncated or invented. Malformed names, IDs, domains, missing
 * hints, duplicate primary roles, and ungrounded evidence are still rejected by
 * the strict schema / grounding pass.
 */
export function normalizeVisualSubjectCatalogInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const primarySubjectId = input['primarySubjectId'];
  const subjects = input['subjects'];
  if (typeof primarySubjectId !== 'string' || !Array.isArray(subjects)) {
    return input;
  }

  const repairs: SubjectNameRepair[] = [];
  const normalizedInput: Record<string, unknown> = {
    ...input,
    subjects: subjects.map((subject) => {
      const normalized = normalizeVisualSubjectInput(subject, primarySubjectId);
      repairs.push(...normalized.repairs);
      return normalized.subject;
    }),
  };
  delete normalizedInput['scenes'];
  const repaired = repairedSceneCues(input['sceneCues'] ?? input['scenes']);
  if (repaired !== undefined) normalizedInput['sceneCues'] = repaired;
  if (repairs.length > 0) {
    const earlier = Array.isArray(input['repairedSubjects'])
      ? input['repairedSubjects']
      : [];
    normalizedInput['repairedSubjects'] = [...earlier, ...repairs].slice(
      0,
      MAX_REPAIRED_SUBJECTS,
    );
  }
  return normalizedInput;
}

function repairedSceneCues(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const repaired: unknown[] = [];
  const seenSceneIds = new Set<string>();
  for (const entry of value) {
    if (repaired.length >= SUBJECT_LIMITS.sceneCues) break;
    if (!isRecord(entry)) continue;
    const sceneId = entry['sceneId'];
    const cue = entry['visualCue'];
    if (typeof sceneId !== 'string' || !SCENE_ID_PATTERN.test(sceneId)) {
      continue;
    }
    if (seenSceneIds.has(sceneId)) continue;
    if (typeof cue !== 'string') continue;
    const visualCue = cue.trim().replace(/\s+/gu, ' ');
    if (visualCue.length < 2 || visualCue.length > MAX_VISUAL_CUE_CHARACTERS) {
      continue;
    }
    seenSceneIds.add(sceneId);
    const rawSubjectId = entry['subjectId'];
    const subjectId =
      typeof rawSubjectId === 'string' &&
      subjectIdSchema.safeParse(rawSubjectId).success
        ? rawSubjectId
        : null;
    repaired.push({ sceneId, subjectId, visualCue });
  }
  return repaired;
}

export function visualSubjectById(
  catalog: VisualSubjectCatalog,
  subjectId: string,
): VisualSubject | null {
  return catalog.subjects.find((subject) => subject.id === subjectId) ?? null;
}

export function visualSubjectsForScene(
  catalog: VisualSubjectCatalog,
  assignment: VisualSceneSubjectAssignment | undefined,
): VisualSubject[] {
  if (!assignment) return [];
  return assignment.subjectIds
    .map((subjectId) => visualSubjectById(catalog, subjectId))
    .filter((subject): subject is VisualSubject => subject !== null);
}

export function subjectNames(subject: VisualSubject): string[] {
  return [subject.canonicalName, ...subject.aliases];
}

export function isIdentityQualifier(value: string): boolean {
  const words = englishWords(value);
  return (
    value.length <= 32 &&
    /^[A-Za-z0-9][A-Za-z0-9+&.'’/ -]*$/u.test(value) &&
    words.length >= 1 &&
    words.length <= 3 &&
    !words.some((word) => !/[A-Za-z]/u.test(word)) &&
    !containsShapingTerm(value)
  );
}

function restatesName(value: string, names: readonly string[]): boolean {
  return names.some((name) => containsEntityPhrase(value, name));
}

export function identitySearchQuery(
  subject: Pick<
    VisualSubject,
    'canonicalName' | 'aliases' | 'type' | 'negativeHints' | 'identityHints'
  >,
  qualifier?: string | null,
): string {
  const name = subject.canonicalName;
  const names = [name, ...subject.aliases];
  if (
    typeof qualifier === 'string' &&
    isIdentityQualifier(qualifier) &&
    !restatesName(qualifier, names)
  )
    return `${name} ${qualifier}`;
  if (qualifier === null && !isAmbiguousVisualSubject(subject)) return name;
  const hint = subject.identityHints.find(
    (hint) => isIdentityQualifier(hint) && !restatesName(hint, names),
  );
  return hint ? `${name} ${hint}` : name;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isAmbiguousVisualSubject(
  subject: Pick<VisualSubject, 'canonicalName' | 'type' | 'negativeHints'>,
): boolean {
  const compact = subject.canonicalName.replace(/[^\p{L}\p{N}]/gu, '');
  // An object anchor is a common noun, so its bare name never identifies the
  // story's instance of it; the identity hint has to become part of the name.
  return (
    subject.type === 'object' ||
    subject.negativeHints.length > 0 ||
    compact.length <= 4 ||
    /^[a-z]+\d+$/i.test(compact)
  );
}

function normalizeVisualSubjectInput(
  input: unknown,
  primarySubjectId: string,
): { subject: unknown; repairs: SubjectNameRepair[] } {
  if (!isRecord(input)) return { subject: input, repairs: [] };
  const id = input['id'];
  const subjectId = typeof id === 'string' ? subjectLabel(id) : 'unknown';
  const canonical = input['canonicalName'];
  const canonicalName =
    typeof canonical === 'string' ? tidyName(canonical) : canonical;
  const repairs: SubjectNameRepair[] = [];
  const aliases = cleanedNameField(
    input,
    'aliases',
    {
      usable: isUsableVisualSubjectName,
      exclude: typeof canonicalName === 'string' ? [canonicalName] : [],
    },
    SUBJECT_LIMITS.aliases,
    subjectId,
    repairs,
  );
  const identityHints = cleanedNameField(
    input,
    'identityHints',
    { usable: isUsableHint },
    SUBJECT_LIMITS.identityHints,
    subjectId,
    repairs,
  );
  const negativeHints = cleanedNameField(
    input,
    'negativeHints',
    { usable: isUsableHint },
    SUBJECT_LIMITS.negativeHints,
    subjectId,
    repairs,
  );
  return {
    subject: {
      ...input,
      canonicalName,
      storyRole: normalizedStoryRole(input['storyRole'], id, primarySubjectId),
      aliases,
      identityHints,
      negativeHints,
      evidenceSceneIds: capArray(
        input['evidenceSceneIds'],
        SUBJECT_LIMITS.evidenceSceneIds,
      ),
      officialDomains: capArray(
        input['officialDomains'],
        SUBJECT_LIMITS.officialDomains,
      ),
    },
    repairs,
  };
}

/**
 * Cleans one list field and reports what it removed. A value that is not an
 * array is returned untouched, so the strict schema still rejects the shape.
 * Cleaning runs before the cap: an invalid entry must not take a bound slot
 * that a valid one could have filled.
 */
function cleanedNameField(
  input: Record<string, unknown>,
  field: SubjectNameField,
  options: { usable: (name: string) => boolean; exclude?: readonly string[] },
  limit: number,
  subjectId: string,
  repairs: SubjectNameRepair[],
): unknown {
  const cleaned = cleanSubjectNameField(
    input[field],
    field,
    subjectId,
    options,
    repairs,
  );
  return cleaned === null ? input[field] : cleaned.slice(0, limit);
}

function normalizedStoryRole(
  value: unknown,
  subjectId: unknown,
  primarySubjectId: string,
): VisualSubject['storyRole'] {
  if (isVisualSubjectRole(value)) {
    return value;
  }
  return subjectId === primarySubjectId ? 'primary' : 'supporting';
}

function capArray(value: unknown, limit: number): unknown {
  return Array.isArray(value) ? value.slice(0, limit) : value;
}

function isVisualSubjectRole(
  value: unknown,
): value is VisualSubject['storyRole'] {
  return (
    typeof value === 'string' &&
    (VISUAL_SUBJECT_ROLES as readonly string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function disambiguateSubjectIdentity(subject: VisualSubject): VisualSubject {
  if (!isAmbiguousVisualSubject(subject)) return subject;

  const originalName = subject.canonicalName;
  const longerAlias = subject.aliases
    .filter((alias) => aliasExtendsName(alias, originalName))
    .sort((left, right) => right.length - left.length)[0];
  if (longerAlias && normalized(longerAlias) !== normalized(originalName)) {
    return {
      ...subject,
      canonicalName: longerAlias,
      aliases: [originalName, ...subject.aliases].filter(
        (alias) => normalized(alias) !== normalized(longerAlias),
      ),
    };
  }

  const hint = subject.identityHints.find((value) => {
    const trimmed = value.trim();
    return (
      trimmed.length >= 2 && trimmed.length <= 24 && !/\s{2,}/u.test(trimmed)
    );
  });
  if (!hint) return subject;

  const contextualName = `${hint} ${originalName}`.replace(/\s+/gu, ' ').trim();
  if (contextualName.length > 80) return subject;
  return {
    ...subject,
    canonicalName: contextualName,
    // Demoting the original name grows the array, so it has to be re-capped:
    // `parseVisualSubjectCatalog` re-validates the disambiguated catalog against
    // the same strict schema, and a subject that arrived at the bound would
    // otherwise fail that second parse and burn a visual attempt. The original
    // name leads because it is the term the image search still needs.
    aliases: [originalName, ...subject.aliases].slice(
      0,
      SUBJECT_LIMITS.aliases,
    ),
  };
}

/**
 * Whether an alias is a longer spelling of the original name. Names of two or
 * more characters match as substrings, which is how "Sol" becomes "Solana". A
 * one-letter name matches only as its own token: "X" sits inside "Texas
 * Instruments" and "Exodus" without being either of them.
 */
function aliasExtendsName(alias: string, name: string): boolean {
  if (isSingleLetterName(name)) return containsExactLetterToken(alias, name);
  return normalized(alias).includes(normalized(name));
}

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/gu, ' ')
    .trim();
}
