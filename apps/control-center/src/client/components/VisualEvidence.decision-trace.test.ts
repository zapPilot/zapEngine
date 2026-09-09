import { describe, expect, it } from 'vitest';

import type { PodcastVisualSceneDebug } from '../../shared/podcast-visual.js';
import { sceneDecisionTrace } from './VisualEvidence.js';

function scene(
  overrides: Partial<PodcastVisualSceneDebug>,
): PodcastVisualSceneDebug {
  return {
    sceneId: 'scene-10',
    sentenceText:
      '跨平台怎麼做到簽名結果一模一樣也是難題；硬體錢包的記憶體限制也得納入。',
    imageSearchIntent: [
      'Bitcoin cryptocurrency',
      'Bitcoin',
      'BIP-32 Bitcoin improvement proposal',
    ],
    imageSearchEntities: ['Bitcoin', 'BIP-32', '比特幣'],
    subjectIds: ['subject-bitcoin', 'subject-bip32'],
    selectionReason: 'direct',
    asset: null,
    trace: [],
    selection: null,
    ...overrides,
  };
}

describe('sceneDecisionTrace', () => {
  it('makes the Shor cross-topic fallback explicit instead of mixing asked and names', () => {
    const trace = sceneDecisionTrace(
      scene({
        selection: {
          selection: 'pool-fallback',
          matchedSubject: 'mathematician Shor + Bitcoin + Quantum computer + Shor',
          sourceQuery: 'Shor mathematician',
          providerRank: 6,
          fallbackReason: 'subject-entries-exhausted',
        },
      }),
    );

    expect(trace.extractedAnchors).toEqual(['Bitcoin', 'BIP-32', '比特幣']);
    expect(trace.intendedQuery).toBe('Bitcoin cryptocurrency');
    expect(trace.selectedQuery).toBe('Shor mathematician');
    expect(trace.crossedTopicFallback).toBe(true);
  });

  it('does not present inherited context as words extracted from this scene', () => {
    const trace = sceneDecisionTrace(
      scene({
        imageSearchEntities: ['Bitcoin'],
        selectionReason: 'section-context',
      }),
    );

    expect(trace.extractedAnchors).toEqual([]);
    expect(trace.inheritedAnchors).toEqual(['Bitcoin']);
  });

  it('keeps a normal same-query selection quiet', () => {
    const trace = sceneDecisionTrace(
      scene({
        imageSearchIntent: ['Shor mathematician'],
        imageSearchEntities: ['Shor'],
        selection: {
          selection: 'pool',
          matchedSubject: 'Shor',
          sourceQuery: 'Shor mathematician',
          providerRank: 8,
          fallbackReason: null,
        },
      }),
    );

    expect(trace.crossedTopicFallback).toBe(false);
    expect(trace.selectedQuery).toBe('Shor mathematician');
  });
});
