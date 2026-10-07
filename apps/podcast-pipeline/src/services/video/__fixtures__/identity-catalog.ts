import { podcastBrandVisualKind } from '../../podcast-packaging.js';
import {
  compactVisualSelection,
  createImageSearchTrace,
  visualSceneSelectionSchema,
} from '../image-search-trace.js';
import {
  enrichedStoryboardDraftSchema,
  type StoryboardDraft,
} from '../storyboard/draft.js';
import { parseVisualSubjectCatalog } from '../storyboard/subject-catalog.js';
import { evaluateVisualQuality } from '../visual-quality-gate.js';

export const fixtureCatalog = parseVisualSubjectCatalog({
  primarySubjectId: 'subject-bank-of-japan',
  subjects: [
    {
      id: 'subject-bank-of-japan',
      canonicalName: 'Bank of Japan',
      type: 'regulator',
      aliases: ['BOJ'],
      storyRole: 'primary',
      evidenceSceneIds: ['scene-01'],
      identityHints: ['central bank'],
      negativeHints: [],
      searchQualifier: null,
    },
  ],
});
export const fixtureQualityReport = evaluateVisualQuality({
  draft: {
    scenes: [
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0001',
        imageSearchIntent: ['Bank of Japan'],
      },
    ],
  },
  catalog: fixtureCatalog,
  imageSearch: createImageSearchTrace({ primary: 5, targeted: 3, max: 8 }),
});
export function fixtureAssignments(draft: StoryboardDraft) {
  return draft.scenes
    .filter((scene) => !podcastBrandVisualKind(scene.imageSearchIntent))
    .map((scene) => ({
      sceneId: scene.sceneId,
      subjectIds: [fixtureCatalog.primarySubjectId],
      selectionReason: 'direct' as const,
    }));
}
export function fixtureEnrichment(draft: StoryboardDraft) {
  return {
    draft: enrichedStoryboardDraftSchema.parse({
      scenes: draft.scenes.map((scene) =>
        podcastBrandVisualKind(scene.imageSearchIntent)
          ? scene
          : {
              ...scene,
              imageSearchIntent: ['Bank of Japan'],
              imageSearchEntities: ['Bank of Japan'],
            },
      ),
    }),
    model: 'openrouter/free',
    enrichedSceneCount: fixtureAssignments(draft).length,
    entityAnchoredSceneCount: fixtureAssignments(draft).length,
    subjectCatalog: fixtureCatalog,
    sceneAssignments: fixtureAssignments(draft),
  };
}
export function fixtureSelection(sceneId = 'scene-01') {
  return visualSceneSelectionSchema.parse({
    sceneId,
    subjectKey: 'bank of japan',
    matchedSubjectKey: null,
    selection: 'article',
    sourceQuery: null,
    providerRank: null,
    fallbackReason: null,
    cueMatched: null,
    rejections: [],
  });
}
export function fixturePlannerContext(
  scenes: readonly { sceneId: string; imageSearchIntent?: readonly string[] }[],
) {
  return {
    subjectCatalog: fixtureCatalog,
    sceneAssignments: scenes
      .filter((scene) => !podcastBrandVisualKind(scene.imageSearchIntent))
      .map((scene) => ({
        sceneId: scene.sceneId,
        subjectIds: [fixtureCatalog.primarySubjectId],
        selectionReason: 'direct' as const,
      })),
  };
}
export function fixtureCompactSelection(sceneId = 'scene-01') {
  return compactVisualSelection(fixtureSelection(sceneId));
}
