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
    ...overrides,
  };
}

describe('sceneDecisionTrace', () => {
  it('exposes that the production scene had no literal Bitcoin/BIP-32 anchor and then crossed to Shor', () => {
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

    expect(trace.extractedAnchors).toEqual([]);
    expect(trace.inheritedAnchors).toEqual(['Bitcoin', 'BIP-32', '比特幣']);
    expect(trace.intendedQuery).toBe('Bitcoin cryptocurrency');
    expect(trace.selectedQuery).toBe('Shor mathematician');
    expect(trace.selectedRank).toBe(6);
    expect(trace.crossedTopicFallback).toBe(true);
  });

  it('shows only anchors literally grounded in this narration span', () => {
    const trace = sceneDecisionTrace(
      scene({
        sentenceText: '比特幣硬體錢包的記憶體限制也得納入。',
        imageSearchEntities: ['Bitcoin', 'BIP-32', '比特幣'],
      }),
    );

    expect(trace.extractedAnchors).toEqual(['比特幣']);
    expect(trace.inheritedAnchors).toEqual(['Bitcoin', 'BIP-32']);
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
        sentenceText: '1994 年 Shor 證明量子電腦可以破解這類簽名。',
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

    expect(trace.extractedAnchors).toEqual(['Shor']);
    expect(trace.crossedTopicFallback).toBe(false);
    expect(trace.selectedQuery).toBe('Shor mathematician');
  });
});
