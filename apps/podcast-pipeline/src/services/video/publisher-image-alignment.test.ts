import { describe, expect, it } from 'vitest';

import { alignPublisherImages } from './publisher-image-alignment.js';

const scenes = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
    text: '普通內容。',
  }));
const image = (position: number | null, precedingText = '') => ({
  imageUrl: 'https://images.test/body.jpg',
  sourceUrl: 'https://publisher.test/article',
  origin: 'article' as const,
  context: {
    position,
    heading: '',
    precedingText,
    followingText: '',
    caption: '',
  },
});

describe('publisher image alignment', () => {
  it('distributes images by article position when lexical evidence is absent', () => {
    const result = alignPublisherImages(
      [0, 0.1, 0.22, 0.35, 0.47, 0.58, 0.7, 0.83, 0.93].map((position) =>
        image(position),
      ),
      scenes(98),
    );
    expect(
      result.placements.map((placement) => Number(placement.sceneId.slice(6))),
    ).toEqual([1, 10, 22, 35, 47, 57, 69, 82, 92]);
    expect(result.overflow).toEqual([]);
  });
  it('distributes unknown positions and preserves order deterministically', () => {
    const images = Array.from({ length: 3 }, () => image(null));
    const result = alignPublisherImages(images, scenes(30));
    expect(result.placements.map((placement) => placement.sceneId)).toEqual([
      'scene-05',
      'scene-15',
      'scene-25',
    ]);
    expect(alignPublisherImages(images, scenes(30))).toEqual(result);
  });
  it('matches Chinese/English evidence and filters ubiquitous words', () => {
    const content = scenes(30);
    content[19] = { sceneId: 'scene-20', text: '香港牌照監管。' };
    const result = alignPublisherImages([image(0.55, '香港牌照监管')], content);
    expect(
      Number(result.placements[0]!.sceneId.slice(6)),
    ).toBeGreaterThanOrEqual(18);
    expect(result.placements[0]!.lexicalScore).toBeGreaterThan(0);
    expect(
      alignPublisherImages([image(0.55, '普通內容')], content).placements[0]!
        .lexicalScore,
    ).toBe(0);
  });
  it('places one image per scene and returns overflow when capacity is smaller', () => {
    expect(
      alignPublisherImages([image(0), image(1), image(0)], scenes(2)).overflow,
    ).toEqual([2]);
    expect(
      alignPublisherImages([image(0), image(0.5), image(1)], scenes(3))
        .placements,
    ).toHaveLength(3);
    const result = alignPublisherImages(
      [image(0), image(0.5), image(1)],
      scenes(2),
    );
    expect(result.placements).toHaveLength(2);
    expect(result.overflow).toHaveLength(1);
    expect(alignPublisherImages([], scenes(2))).toEqual({
      placements: [],
      overflow: [],
    });
    expect(alignPublisherImages([image(null)], [])).toEqual({
      placements: [],
      overflow: [0],
    });
  });

  it('limits lexical displacement and keeps reverse lexical peaks monotonic', () => {
    const content = scenes(40);
    content[35] = { sceneId: 'scene-36', text: '香港牌照监管。' };
    content[3] = { sceneId: 'scene-04', text: '韩国证券托管。' };
    const distant = alignPublisherImages(
      [image(0.05, '香港牌照监管')],
      content,
    );
    expect(Number(distant.placements[0]!.sceneId.slice(6))).toBeLessThan(18);
    const reverse = alignPublisherImages(
      [image(0.3, '香港牌照监管'), image(0.7, '韩国证券托管')],
      content,
    );
    const ordinals = reverse.placements.map((placement) =>
      Number(placement.sceneId.slice(6)),
    );
    expect(ordinals[0]).toBeLessThan(ordinals[1]!);
  });

  it('matches English captions against English evidence and traditional captions against simplified narration', () => {
    const content: { sceneId: string; text: string; englishText?: string }[] =
      scenes(40);
    for (const index of [18, 19, 20])
      content[index] = {
        ...content[index]!,
        text: '香港证券牌照监管。',
        englishText: 'Finloop licensed custody',
      };
    const english = image(0.45);
    english.context.caption = 'Finloop licensed custody';
    const traditional = image(0.45);
    traditional.context.caption = '香港證券牌照監管';
    for (const candidate of [english, traditional]) {
      const placement = alignPublisherImages([candidate], content)
        .placements[0]!;
      expect(placement.lexicalScore).toBeGreaterThan(0);
      expect(Number(placement.sceneId.slice(6))).toBeGreaterThanOrEqual(18);
      expect(Number(placement.sceneId.slice(6))).toBeLessThanOrEqual(22);
    }
    const adjacent = alignPublisherImages(
      [english, traditional],
      content,
    ).placements;
    expect(
      Number(adjacent[1]!.sceneId.slice(6)) -
        Number(adjacent[0]!.sceneId.slice(6)),
    ).toBe(1);
  });
});

it('keeps full-episode positions and vocabulary when only late scenes remain available', () => {
  const content = scenes(30);
  const availableSceneIds = new Set(
    content.slice(20).map((scene) => scene.sceneId),
  );
  const proportional = alignPublisherImages([image(0.79)], content, {
    availableSceneIds,
  });
  expect(proportional.placements[0]!.sceneId).toBe('scene-24');
  for (const index of [22, 23, 24])
    content[index] = { ...content[index]!, text: '香港牌照监管。' };
  const lexical = alignPublisherImages([image(0.75, '香港牌照监管')], content, {
    availableSceneIds: new Set(['scene-23', 'scene-24', 'scene-25']),
  });
  expect(
    Number(lexical.placements[0]!.sceneId.slice(6)),
  ).toBeGreaterThanOrEqual(23);
  expect(lexical.placements[0]!.lexicalScore).toBeGreaterThan(0);
  expect(
    alignPublisherImages([image(0.8)], content, {
      availableSceneIds: new Set(),
    }),
  ).toEqual({ placements: [], overflow: [0] });
});
