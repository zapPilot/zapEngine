import { z } from 'zod';

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
  'section-context',
  'episode-context',
  'brand',
] as const;

const subjectIdSchema = z.string().regex(/^subject-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sceneIdSchema = z.string().regex(/^scene-\d{2}$/);
const shortTextSchema = z.string().min(2).max(80);
const SUBJECT_LIMITS = {
  aliases: 6,
  evidenceSceneIds: 64,
  searchQueries: 3,
  identityHints: 8,
  negativeHints: 8,
  officialDomains: 4,
} as const;

export const visualSubjectSchema = z
  .object({
    id: subjectIdSchema,
    canonicalName: shortTextSchema,
    type: z.enum(VISUAL_SUBJECT_TYPES),
    aliases: z.array(shortTextSchema).max(SUBJECT_LIMITS.aliases).default([]),
    storyRole: z.enum(VISUAL_SUBJECT_ROLES),
    evidenceSceneIds: z
      .array(sceneIdSchema)
      .max(SUBJECT_LIMITS.evidenceSceneIds),
    searchQueries: z
      .array(shortTextSchema)
      .min(1)
      .max(SUBJECT_LIMITS.searchQueries),
    identityHints: z
      .array(shortTextSchema)
      .min(1)
      .max(SUBJECT_LIMITS.identityHints),
    negativeHints: z
      .array(shortTextSchema)
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
  })
  .strict();

/**
 * Why a compact LLM subject never made it into the catalog. One bad subject used
 * to fail the whole catalog and hand every scene to generic B-roll queries, so
 * the drop is recorded instead and the rest of the catalog still anchors images.
 */
export const VISUAL_SUBJECT_DROP_REASONS = [
  'missing-canonical-name',
  'invalid-type',
  'type-other',
  'generic-term',
  'not-grounded',
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

export const visualSubjectCatalogSchema = z
  .object({
    primarySubjectId: subjectIdSchema,
    subjects: z.array(visualSubjectSchema).min(1).max(24),
    droppedSubjects: z.array(visualSubjectDropSchema).max(24).optional(),
  })
  .strict()
  .superRefine((catalog, context) => {
    const ids = new Set(catalog.subjects.map((subject) => subject.id));
    if (ids.size !== catalog.subjects.length) {
      context.addIssue({
        code: 'custom',
        message: 'Visual subject catalog contains duplicate subject IDs',
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
  const parsed = visualSubjectCatalogSchema.parse(
    normalizeVisualSubjectCatalogInput(input),
  );
  return visualSubjectCatalogSchema.parse({
    ...parsed,
    subjects: parsed.subjects.map(disambiguateSubjectIdentity),
  });
}

/**
 * LLM JSON is not application state yet. Repair bounded, mechanically obvious
 * shape drift before strict validation so one verbose completion cannot burn
 * all three visual attempts for an otherwise valid episode.
 *
 * This intentionally does not invent identity content: malformed names, IDs,
 * domains, missing hints, duplicate primary roles, and ungrounded evidence are
 * still rejected by the strict schema / grounding pass.
 */
export function normalizeVisualSubjectCatalogInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const primarySubjectId = input['primarySubjectId'];
  const subjects = input['subjects'];
  if (typeof primarySubjectId !== 'string' || !Array.isArray(subjects)) {
    return input;
  }

  return {
    ...input,
    subjects: subjects.map((subject) =>
      normalizeVisualSubjectInput(subject, primarySubjectId),
    ),
  };
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

export function buildVisualSubjectSearchQueries(
  subject: VisualSubject,
): string[] {
  const canonical = subject.canonicalName.toLocaleLowerCase('en-US');
  // Disambiguation demotes the original short name into `aliases`, so a query
  // already carrying that name names the subject and must not be prefixed with
  // the contextual canonical name on top of it.
  const names = subjectNames(subject).map((name) =>
    name.toLocaleLowerCase('en-US'),
  );
  const queries = subject.searchQueries.map((query) => {
    const lowered = query.toLocaleLowerCase('en-US');
    if (names.some((name) => lowered.includes(name))) return query;
    return `${subject.canonicalName} ${query}`.slice(0, 80).trim();
  });
  if (
    !queries.some((query) => query.toLocaleLowerCase('en-US') === canonical)
  ) {
    queries.push(subject.canonicalName);
  }
  return [...new Set(queries)].slice(0, 4);
}

export function isAmbiguousVisualSubject(subject: VisualSubject): boolean {
  const compact = subject.canonicalName.replace(/[^\p{L}\p{N}]/gu, '');
  return (
    subject.negativeHints.length > 0 ||
    compact.length <= 4 ||
    /^[a-z]+\d+$/i.test(compact)
  );
}

function normalizeVisualSubjectInput(
  input: unknown,
  primarySubjectId: string,
): unknown {
  if (!isRecord(input)) return input;
  const id = input['id'];
  const storyRole = normalizedStoryRole(
    input['storyRole'],
    id,
    primarySubjectId,
  );
  return {
    ...input,
    storyRole,
    aliases: capArray(input['aliases'], SUBJECT_LIMITS.aliases),
    evidenceSceneIds: capArray(
      input['evidenceSceneIds'],
      SUBJECT_LIMITS.evidenceSceneIds,
    ),
    searchQueries: capArray(
      input['searchQueries'],
      SUBJECT_LIMITS.searchQueries,
    ),
    identityHints: capArray(
      input['identityHints'],
      SUBJECT_LIMITS.identityHints,
    ),
    negativeHints: capArray(
      input['negativeHints'],
      SUBJECT_LIMITS.negativeHints,
    ),
    officialDomains: capArray(
      input['officialDomains'],
      SUBJECT_LIMITS.officialDomains,
    ),
  };
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
    .filter((alias) => normalized(alias).includes(normalized(originalName)))
    .sort((left, right) => right.length - left.length)[0];
  if (longerAlias && normalized(longerAlias) !== normalized(originalName)) {
    return {
      ...subject,
      canonicalName: longerAlias,
      aliases: uniqueNames([originalName, ...subject.aliases]).filter(
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
    aliases: uniqueNames([originalName, ...subject.aliases]).slice(
      0,
      SUBJECT_LIMITS.aliases,
    ),
  };
}

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/gu, ' ')
    .trim();
}

function uniqueNames(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalized(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
