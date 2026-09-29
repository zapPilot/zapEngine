import { describe, expect, it } from 'vitest';

import type { CanonicalAudioTiming } from '../audio-analysis.js';
import { materializeLocaleVideoManifest } from './materialize.js';
import { splitCanonicalSentences } from './sentences.js';
import {
  deterministicConceptCardCopy,
  validateConceptCardCopy,
} from './slide-copy.js';
import { validateStoryboardDraft } from './validation.js';
import { materializeImageVisualPlan, stableSceneId } from './visual-plan.js';

function sceneSource(sceneId: string) {
  return {
    id: `${sceneId}-source`,
    label: `${sceneId} source`,
    url: `https://images.example.test/pages/${sceneId}`,
    attribution: 'Example News',
    license: 'unknown' as const,
    licenseUrl: null,
  };
}

function sceneAsset(sceneId: string) {
  return {
    kind: 'remoteImage' as const,
    sourceId: `${sceneId}-source`,
    url: `https://images.example.test/${sceneId}.jpg`,
    sha256: 'a'.repeat(64),
    layout: 'fullBleed' as const,
    motion: 'static' as const,
    position: 'center' as const,
  };
}

function brandSceneSource(sceneId: string) {
  return {
    ...sceneSource(sceneId),
    license: 'brand-generated' as const,
  };
}

describe('validation control characters', () => {
  it('rejects C0 controls other than tab, LF, and CR', () => {
    const singleScript = 'Hello world.';
    const singleSentences = [
      {
        id: 's0001',
        index: 0,
        text: 'Hello world.',
        startOffset: 0,
        endOffset: singleScript.length,
      },
    ] as const;
    const singleContext = {
      script: singleScript,
      sentences: singleSentences,
      durationMs: 5_000,
    };
    const base = {
      sceneId: 'scene-01',
      startSentenceId: 's0001',
      endSentenceId: 's0001',
    };
    const bad = validateStoryboardDraft(
      { scenes: [{ ...base, imageSearchIntent: ['bell\x07photo'] }] },
      singleContext,
    );
    expect(bad.success).toBe(false);

    for (const allowed of ['a\tb', 'a\nb', 'a\rb']) {
      const ok = validateStoryboardDraft(
        { scenes: [{ ...base, imageSearchIntent: [allowed] }] },
        singleContext,
      );
      expect(ok.success).toBe(true);
    }
  });
});

describe('materialize missing locale timing', () => {
  it('fails when timing misses a scene sentence', () => {
    const localized = splitCanonicalSentences(
      'Markets changed. Policy followed.',
    );
    const timing: CanonicalAudioTiming = {
      durationMs: 20_000,
      sentences: [
        { sentence: localized[0]!, startMs: 0, endMs: 10_000 },
        { sentence: localized[1]!, startMs: 10_000, endMs: 20_000 },
      ],
      captions: [
        { startMs: 0, endMs: 10_000, text: 'Markets changed.' },
        { startMs: 10_000, endMs: 20_000, text: 'Policy followed.' },
      ],
      silences: [],
    };
    const draft = {
      scenes: localized.map((sentence, index) => ({
        sceneId: stableSceneId(index),
        startSentenceId: sentence.id,
        endSentenceId: sentence.id,
        imageSearchIntent: [`intent ${index + 1}`],
      })),
    };
    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: draft.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        sources: [sceneSource(scene.sceneId)],
        asset: sceneAsset(scene.sceneId),
      })),
    });
    const brokenTiming: CanonicalAudioTiming = {
      ...timing,
      sentences: timing.sentences.slice(0, 1),
    };
    expect(() =>
      materializeLocaleVideoManifest({
        visualPlan,
        timing: brokenTiming,
        sceneAlignment: draft.scenes.map((scene) => ({
          sceneId: scene.sceneId,
          startSentenceId: scene.startSentenceId,
          endSentenceId: scene.endSentenceId,
        })),
        episode: {
          id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
          localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
          languageCode: 'en',
          title: 'Markets',
        },
        audioSource: '/audio/en.m4a',
      }),
    ).toThrow('unknown locale sentence');
  });

  it('rejects a missing alignment entry even when the array length matches', () => {
    const localized = splitCanonicalSentences(
      'Markets changed. Policy followed.',
    );
    const timing: CanonicalAudioTiming = {
      durationMs: 20_000,
      sentences: [
        { sentence: localized[0]!, startMs: 0, endMs: 10_000 },
        { sentence: localized[1]!, startMs: 10_000, endMs: 20_000 },
      ],
      captions: [],
      silences: [],
    };
    const draft = {
      scenes: localized.map((sentence, index) => ({
        sceneId: stableSceneId(index),
        startSentenceId: sentence.id,
        endSentenceId: sentence.id,
        imageSearchIntent: [`intent ${index + 1}`],
      })),
    };
    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: draft.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        sources: [sceneSource(scene.sceneId)],
        asset: sceneAsset(scene.sceneId),
      })),
    });
    const sceneAlignment = [
      {
        sceneId: draft.scenes[0]!.sceneId,
        startSentenceId: localized[0]!.id,
        endSentenceId: localized[0]!.id,
      },
      undefined,
    ] as unknown as Parameters<
      typeof materializeLocaleVideoManifest
    >[0]['sceneAlignment'];

    expect(() =>
      materializeLocaleVideoManifest({
        visualPlan,
        timing,
        sceneAlignment,
        episode: {
          id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
          localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
          languageCode: 'en',
          title: 'Markets',
        },
        audioSource: '/audio/en.m4a',
      }),
    ).toThrow('Scene alignment 2 must reference scene-02');
  });

  it('fits transitions when every slide is brand-generated', () => {
    const localized = splitCanonicalSentences(
      'Markets changed. Policy followed.',
    );
    const timing: CanonicalAudioTiming = {
      durationMs: 20_000,
      sentences: [
        { sentence: localized[0]!, startMs: 0, endMs: 10_000 },
        { sentence: localized[1]!, startMs: 10_000, endMs: 20_000 },
      ],
      captions: [
        { startMs: 0, endMs: 10_000, text: 'Markets changed.' },
        { startMs: 10_000, endMs: 20_000, text: 'Policy followed.' },
      ],
      silences: [],
    };
    const draft = {
      scenes: localized.map((sentence, index) => ({
        sceneId: stableSceneId(index),
        startSentenceId: sentence.id,
        endSentenceId: sentence.id,
        imageSearchIntent: [`intent ${index + 1}`],
      })),
    };
    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: draft.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        sources: [brandSceneSource(scene.sceneId)],
        asset: sceneAsset(scene.sceneId),
      })),
    });
    const manifest = materializeLocaleVideoManifest({
      visualPlan,
      timing,
      sceneAlignment: draft.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        startSentenceId: scene.startSentenceId,
        endSentenceId: scene.endSentenceId,
      })),
      episode: {
        id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
        localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
        languageCode: 'en',
        title: 'Markets',
      },
      audioSource: '/audio/en.m4a',
    });
    expect(manifest.clip.transitionMs).toBeGreaterThanOrEqual(0);
    expect(manifest.slides).toHaveLength(2);
  });
});

describe('sentence splitting edges', () => {
  it('handles leading periods, abbreviations, and whitespace-only gaps', () => {
    expect(splitCanonicalSentences('. Start.')[0]?.text).toBe('.');
    expect(splitCanonicalSentences('Mr. Smith went. He left.')[0]?.text).toBe(
      'Mr. Smith went.',
    );
    expect(splitCanonicalSentences('First.   \n   Second.')).toHaveLength(2);
    expect(splitCanonicalSentences('end.Next')[0]?.text).toBe('end.');
    expect(splitCanonicalSentences('3.14 stays. Next.')[0]?.text).toBe(
      '3.14 stays.',
    );
  });
});

describe('concept card grounding', () => {
  it('rejects ungrounded numbers and entities', () => {
    const request = {
      title: 'NVIDIA launch',
      evidence: 'NVIDIA launched a GPU with 25 billion transistors',
      entities: ['NVIDIA'],
      intent: ['NVIDIA GPU launch keynote'],
      lead: false,
    };
    expect(
      validateConceptCardCopy(
        {
          kicker: 'CONCEPT',
          headline: 'NVIDIA GPU Launch',
          points: ['999 billion transistors ready', 'GPU keynote stage'],
        },
        request,
      ),
    ).toBeNull();
    expect(
      validateConceptCardCopy(
        {
          kicker: 'CONCEPT',
          headline: 'Apple Harvest Day',
          points: ['Fresh fruit', 'Orchard views'],
        },
        request,
      ),
    ).toBeNull();
    expect(
      validateConceptCardCopy(
        {
          kicker: 'CONCEPT',
          headline: 'NVIDIA GPU Launch',
          points: ['25 billion transistors ready', 'GPU launch keynote stage'],
        },
        request,
      ),
    ).not.toBeNull();
  });

  it('builds deterministic copy without repeating the headline', () => {
    const copy = deterministicConceptCardCopy({
      title: 'Markets rally on policy',
      evidence: 'Markets rally on policy news today',
      entities: ['Federal Reserve'],
      intent: ['Federal Reserve policy'],
      lead: true,
    });
    expect(copy.kicker).toBe('LEAD CONCEPT');
    expect(copy.headline.length).toBeGreaterThan(0);
    expect(copy.points).toHaveLength(2);
  });
});
