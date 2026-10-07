import { z } from 'zod';

import { podcastBrandVisualKind } from '../podcast-packaging.js';
import type {
  VisualImageSearch,
  VisualSceneSelection,
} from './image-search-trace.js';
import { containsShapingTerm } from './search-vocabulary.js';
import type { EnrichedStoryboardDraft } from './storyboard/draft.js';
import {
  subjectNames,
  type VisualSubjectCatalog,
} from './storyboard/subject-catalog.js';

export const MAX_CROSS_SUBJECT_FALLBACK_RATIO = 0.5;
export const MIN_SCENES_FOR_RATIO_GATES = 10;
export const visualQualityReportSchema = z
  .object({
    passed: z.boolean(),
    violations: z.array(z.string()),
    contentScenes: z.number().int().nonnegative(),
    crossSubjectFallbackRatio: z.number(),
    crossSubjectReuseRatio: z.number(),
    reuseRatio: z.number(),
    slideRatio: z.number(),
    cueUnmatchedRatio: z.number(),
    maxQuerySceneRatio: z.number(),
    fallbackBases: z.record(z.string(), z.number().int().nonnegative()),
    publisher: z
      .object({
        bodyOrdinals: z.array(z.number().int().positive()),
        frontShare: z.number(),
        expectedFrontShare: z.number(),
      })
      .strict(),
  })
  .strict();
export type VisualQualityReport = z.infer<typeof visualQualityReportSchema>;

export class VisualQualityGateError extends Error {
  constructor(readonly report: VisualQualityReport) {
    super(`Visual quality gate rejected: ${report.violations.join('; ')}`);
    this.name = 'VisualQualityGateError';
  }
}

export function evaluateVisualQuality(input: {
  draft: EnrichedStoryboardDraft;
  catalog: VisualSubjectCatalog;
  imageSearch: VisualImageSearch;
}): VisualQualityReport {
  const content = input.draft.scenes.filter(
    (scene) => !podcastBrandVisualKind(scene.imageSearchIntent),
  );
  const count = content.length;
  const identities = new Set(
    input.catalog.subjects.map((subject) => subject.searchQuery),
  );
  const names = input.catalog.subjects.flatMap(subjectNames);
  const violations = new Set<string>();
  for (const query of [
    ...input.imageSearch.requests.map((request) => request.query),
    ...content.flatMap((scene) => scene.imageSearchIntent),
  ]) {
    if (!identities.has(query)) violations.add('non-catalog-query');
    if (containsShapingTerm(query, names)) violations.add('query-shaping-term');
  }
  const contentIds = new Set(content.map((scene) => scene.sceneId));
  const selections = input.imageSearch.scenes.filter((scene) =>
    contentIds.has(scene.sceneId),
  );
  const ratio = (
    predicate: (scene: (typeof selections)[number]) => boolean,
  ): number => (count ? selections.filter(predicate).length / count : 0);
  const crossSubject = (scene: (typeof selections)[number]): boolean =>
    scene.matchedSubjectKey !== null &&
    scene.subjectKey !== scene.matchedSubjectKey;
  const crossSubjectFallbackRatio = ratio(
    (scene) => scene.selection === 'pool-fallback' && crossSubject(scene),
  );
  const fallbackBases: Record<string, number> = {};
  for (const scene of selections) {
    if (scene.selection === 'pool-fallback' && !scene.fallbackBasis)
      violations.add('fallback-missing-basis');
    if (scene.fallbackBasis)
      fallbackBases[scene.fallbackBasis] =
        (fallbackBases[scene.fallbackBasis] ?? 0) + 1;
  }
  if (
    count >= MIN_SCENES_FOR_RATIO_GATES &&
    crossSubjectFallbackRatio > MAX_CROSS_SUBJECT_FALLBACK_RATIO
  )
    violations.add('cross-subject-fallback-ratio');
  const publisher = publisherQuality(content, selections, violations);
  const queryScenes = new Map<string, number>();
  for (const scene of content)
    for (const query of new Set(scene.imageSearchIntent))
      queryScenes.set(query, (queryScenes.get(query) ?? 0) + 1);
  return visualQualityReportSchema.parse({
    passed: violations.size === 0,
    violations: [...violations],
    contentScenes: count,
    crossSubjectFallbackRatio,
    crossSubjectReuseRatio: ratio(
      (scene) => scene.selection === 'reuse' && crossSubject(scene),
    ),
    reuseRatio: ratio((scene) => scene.selection === 'reuse'),
    slideRatio: ratio((scene) => scene.selection === 'generated-slide'),
    cueUnmatchedRatio: ratio((scene) => scene.cueMatched === false),
    maxQuerySceneRatio: count
      ? Math.max(0, ...queryScenes.values()) / count
      : 0,
    fallbackBases,
    publisher,
  });
}

function publisherQuality(
  content: EnrichedStoryboardDraft['scenes'],
  selections: readonly VisualSceneSelection[],
  violations: Set<string>,
): VisualQualityReport['publisher'] {
  const count = content.length;
  const ordinal = new Map(
    content.map((scene, index) => [scene.sceneId, index + 1]),
  );
  const bodies = selections.filter(
    (scene) => scene.publisherImage?.role === 'body',
  );
  const bodyOrdinals = bodies
    .map((scene) => ordinal.get(scene.sceneId)!)
    .sort((a, b) => a - b);
  const frontEnd = Math.ceil(0.15 * count);
  const frontShare = bodies.length
    ? bodyOrdinals.filter((value) => value <= frontEnd).length / bodies.length
    : 0;
  const expectedFrontShare = bodies.length
    ? bodies.filter(
        (scene) => (scene.publisherImage!.articlePosition ?? 1) <= 0.15,
      ).length / bodies.length
    : 0;
  if (
    bodies.length >= 3 &&
    count >= 20 &&
    frontShare >= 0.5 &&
    frontShare - expectedFrontShare >= 0.3
  )
    violations.add('publisher-front-loaded');
  if (
    bodies.length >= 3 &&
    bodyOrdinals.every((value, index) => value === index + 1) &&
    bodies.some(
      (scene) =>
        scene.publisherImage!.articlePosition === null ||
        scene.publisherImage!.articlePosition >= 0.3,
    )
  )
    violations.add('publisher-prefix-packed');
  return { bodyOrdinals, frontShare, expectedFrontShare };
}
