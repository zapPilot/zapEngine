import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  PODCAST_INTRO_VISUAL_INTENT,
  PODCAST_OUTRO_VISUAL_INTENT,
} from '../podcast-packaging.js';
import {
  fixtureBraveResults,
  fixtureImageFingerprint,
  fixtureRemoteImage,
} from './__fixtures__/planner-images.js';
import { planPodcastVisualAssets } from './podcast-visual-assets.js';
import { parseVisualSubjectCatalog } from './storyboard/subject-catalog.js';
import { evaluateVisualQuality } from './visual-quality-gate.js';

const topics = [
  { word: '韩国投资限制', start: 3 },
  { word: '香港牌照监管', start: 14 },
  { word: 'Finloop Hong Kong', start: 27 },
  { word: 'BVI监管框架', start: 38 },
  { word: 'SPV资产隔离', start: 49 },
  { word: '券商服务流程', start: 60 },
  { word: '代币化证券发行', start: 71 },
  { word: '托管资产保障', start: 82 },
  { word: '全球投资者参与', start: 93 },
];
const sceneId = (ordinal: number) =>
  `scene-${String(ordinal + 1).padStart(2, '0')}`;

it('aligns nine RWA publisher images before any Brave request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rwa-identity-regression-'));
  try {
    const content = Array.from({ length: 99 }, (_, index) => {
      const ordinal = index + 1;
      return {
        sceneId: sceneId(ordinal),
        startSentenceId: `s${String(ordinal + 1).padStart(4, '0')}`,
        endSentenceId: `s${String(ordinal + 1).padStart(4, '0')}`,
        imageSearchIntent: [
          ordinal >= 27 && ordinal <= 29
            ? 'Finloop Hong Kong'
            : 'RWA Hong Kong',
        ],
      };
    });
    const draft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
        },
        ...content,
        {
          sceneId: 'scene-101',
          startSentenceId: 's0101',
          endSentenceId: 's0101',
          imageSearchIntent: [PODCAST_OUTRO_VISUAL_INTENT],
        },
      ],
    };
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-rwa',
      subjects: [
        {
          id: 'subject-rwa',
          canonicalName: 'RWA',
          type: 'asset',
          aliases: [],
          storyRole: 'primary',
          evidenceSceneIds: [sceneId(1)],
          identityHints: ['Hong Kong'],
          negativeHints: [],
          searchQualifier: 'Hong Kong',
        },
        {
          id: 'subject-finloop',
          canonicalName: 'Finloop',
          type: 'company',
          aliases: [],
          storyRole: 'secondary',
          evidenceSceneIds: [sceneId(27)],
          identityHints: ['Hong Kong'],
          negativeHints: [],
          searchQualifier: 'Hong Kong',
        },
      ],
    });
    const narration = new Map(
      content.map((scene, index) => {
        const ordinal = index + 1;
        const topic = topics.find(
          (entry) => ordinal >= entry.start && ordinal <= entry.start + 2,
        );
        return [
          scene.sceneId,
          {
            text: topic ? `${topic.word}正在讨论。` : '正在说明相关细节。',
            englishText: topic?.word ?? 'The discussion continues.',
          },
        ];
      }),
    );
    const body = topics.map((topic, index) => ({
      imageUrl: `https://uploads.panewslab.com/body-${index}.jpg`,
      sourceUrl: 'https://panews.io/articles/synthetic-rwa',
      origin: 'article' as const,
      context: {
        position: Math.max(
          0,
          (topic.start + 1) / 99 + (index % 2 ? 0.06 : -0.06),
        ),
        heading: '',
        precedingText: topic.word,
        followingText: '',
        caption: '',
      },
    }));
    const lead = {
      imageUrl: 'https://uploads.panewslab.com/lead.jpg',
      sourceUrl: 'https://panews.io/articles/synthetic-rwa',
      origin: 'openGraph' as const,
      width: 2400,
      height: 1350,
    };
    const calls: string[] = [];
    const identities = new Set(['RWA Hong Kong', 'Finloop Hong Kong']);
    const search = vi.fn(async (query: string) => {
      expect(identities.has(query)).toBe(true);
      calls.push(`search:${query}`);
      return fixtureBraveResults(query, 20);
    });
    const result = await planPodcastVisualAssets({
      scenes: draft.scenes,
      subjectCatalog: catalog,
      sceneAssignments: content.map((scene, index) => ({
        sceneId: scene.sceneId,
        subjectIds: [
          index >= 26 && index <= 28 ? 'subject-finloop' : 'subject-rwa',
        ],
        selectionReason: 'direct' as const,
      })),
      articleImages: [lead, ...body],
      sceneNarration: narration,
      workingDirectory: directory,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(async (url: string) => {
          calls.push(`download:${url}`);
          return fixtureRemoteImage(url, directory);
        }),
        fingerprintImage: vi.fn(async (path: string) =>
          fixtureImageFingerprint(path),
        ),
        searchProviders: [{ origin: 'brave', search }],
      },
    });
    expect(result.imageSearch!.publisherImages).toEqual({
      offered: 9,
      resumed: 0,
      placed: 9,
      rejected: 0,
      overflow: 0,
    });
    expect(calls.slice(0, 10)).toEqual(
      [lead, ...body].map((image) => `download:${image.imageUrl}`),
    );
    expect(calls[10]).toMatch(/^search:/u);
    const placements = result.imageSearch!.scenes.filter(
      (scene) => scene.publisherImage?.role === 'body',
    );
    expect(placements).toHaveLength(9);
    const ordinals = placements.map(
      (placement) => Number(placement.sceneId.slice(6)) - 1,
    );
    for (const [index, ordinal] of ordinals.entries()) {
      expect(ordinal).toBeGreaterThanOrEqual(topics[index]!.start);
      expect(ordinal).toBeLessThanOrEqual(topics[index]!.start + 2);
    }
    expect(
      ordinals.filter((ordinal) => ordinal >= 2 && ordinal <= 10),
    ).toHaveLength(1);
    expect(
      evaluateVisualQuality({
        draft,
        catalog,
        imageSearch: result.imageSearch!,
      }).passed,
    ).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
