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

export const visualSubjectSchema = z
  .object({
    id: subjectIdSchema,
    canonicalName: shortTextSchema,
    type: z.enum(VISUAL_SUBJECT_TYPES),
    aliases: z.array(shortTextSchema).max(6).default([]),
    storyRole: z.enum(VISUAL_SUBJECT_ROLES),
    evidenceSceneIds: z.array(sceneIdSchema).min(1).max(24),
    searchQueries: z.array(shortTextSchema).min(1).max(3),
    identityHints: z.array(shortTextSchema).min(1).max(8),
    negativeHints: z.array(shortTextSchema).max(8).default([]),
    officialDomains: z
      .array(
        z
          .string()
          .min(3)
          .max(120)
          .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
      )
      .max(4)
      .default([]),
  })
  .strict();

export const visualSubjectCatalogSchema = z
  .object({
    primarySubjectId: subjectIdSchema,
    subjects: z.array(visualSubjectSchema).min(1).max(24),
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
        message: 'Visual subject catalog must contain exactly one primary subject',
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
  });

export const visualSceneSubjectAssignmentSchema = z
  .object({
    sceneId: sceneIdSchema,
    subjectIds: z.array(subjectIdSchema).min(1).max(4),
    selectionReason: z.enum(VISUAL_SELECTION_REASONS),
  })
  .strict();

export type VisualSubject = z.infer<typeof visualSubjectSchema>;
export type VisualSubjectCatalog = z.infer<typeof visualSubjectCatalogSchema>;
export type VisualSceneSubjectAssignment = z.infer<
  typeof visualSceneSubjectAssignmentSchema
>;
export type VisualSelectionReason = VisualSceneSubjectAssignment['selectionReason'];

export function parseVisualSubjectCatalog(input: unknown): VisualSubjectCatalog {
  return visualSubjectCatalogSchema.parse(input);
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

export function buildVisualSubjectSearchQueries(subject: VisualSubject): string[] {
  const names = subjectNames(subject);
  const canonical = subject.canonicalName.toLocaleLowerCase('en-US');
  const queries = subject.searchQueries.map((query) => {
    const lowered = query.toLocaleLowerCase('en-US');
    if (names.some((name) => lowered.includes(name.toLocaleLowerCase('en-US')))) {
      return query;
    }
    return `${subject.canonicalName} ${query}`.slice(0, 80).trim();
  });
  if (!queries.some((query) => query.toLocaleLowerCase('en-US') === canonical)) {
    queries.push(subject.canonicalName);
  }
  return [...new Set(queries)].slice(0, 4);
}

export function isAmbiguousVisualSubject(subject: VisualSubject): boolean {
  const compact = subject.canonicalName.replace(/[^\p{L}\p{N}]/gu, '');
  return compact.length <= 4 || /^[a-z]+\d+$/i.test(compact);
}
