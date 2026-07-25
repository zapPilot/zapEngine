import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  type ImageVideoManifest,
  OUTRO_TAIL_MS,
  parseImageVideoManifest,
  parseSlideVideoManifest,
  parseVerticalVideoManifest,
  type SlideVideoManifest,
  slideVideoManifestSchema,
  type VerticalVideoManifest,
} from './manifest.js';

const previewManifestPath = new URL(
  '../../../examples/video/heat-grid-90s.manifest.json',
  import.meta.url,
);

function loadPreviewManifest(): SlideVideoManifest {
  const input = JSON.parse(
    readFileSync(previewManifestPath, 'utf8'),
  ) as unknown;
  return parseSlideVideoManifest(input);
}

function expectCustomIssue(
  manifest: SlideVideoManifest,
  expectedMessage: string,
): void {
  const result = slideVideoManifestSchema.safeParse(manifest);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected manifest validation to fail');
  expect(result.error.issues.map((issue) => issue.message)).toContain(
    expectedMessage,
  );
}

function findSlide(
  manifest: SlideVideoManifest,
  id: string,
): SlideVideoManifest['slides'][number] {
  const slide = manifest.slides.find((candidate) => candidate.id === id);
  if (!slide) throw new Error(`Missing test slide ${id}`);
  return slide;
}

function createImageManifest(): ImageVideoManifest {
  return parseImageVideoManifest({
    schemaVersion: 'podcast-slide-video.v2',
    rendererVersion: 'satori-resvg-v3',
    episode: {
      id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      languageCode: 'zh-Hant',
      title: 'Image video',
    },
    clip: {
      startMs: 0,
      durationMs: 90_000,
      width: 1920,
      height: 1080,
      fps: 30,
      transitionMs: 200,
    },
    audio: { sourceUrl: '/audio/main.m4a' },
    slides: Array.from({ length: 9 }, (_, index) => {
      const sceneId = `scene-${String(index + 1).padStart(2, '0')}`;
      return {
        id: sceneId,
        startMs: index * 10_000,
        endMs: (index + 1) * 10_000,
        template: 'image',
        sources: [
          {
            id: `${sceneId}-source`,
            label: `${sceneId} source`,
            url: `https://news.example.test/${sceneId}`,
            attribution: 'Example News',
            license: 'unknown',
            licenseUrl: null,
          },
        ],
        asset: {
          kind: 'remoteImage',
          sourceId: `${sceneId}-source`,
          url: `https://images.example.test/${sceneId}.jpg`,
          sha256: 'a'.repeat(64),
          layout: 'fullBleed',
          position: 'center',
        },
      };
    }),
    captions: Array.from({ length: 9 }, (_, index) => ({
      startMs: index * 10_000,
      endMs: (index + 1) * 10_000,
      text: `字幕 ${index + 1}`,
    })),
  });
}

function createVerticalManifest(): VerticalVideoManifest {
  return parseVerticalVideoManifest({
    schemaVersion: 'podcast-slide-video.v3',
    rendererVersion: 'satori-resvg-v4',
    episode: {
      id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      languageCode: 'zh-Hant',
      title: '世界盃最賺錢的生意',
    },
    clip: {
      startMs: 0,
      durationMs: 90_000 + OUTRO_TAIL_MS,
      width: 1080,
      height: 1920,
      fps: 30,
      transitionMs: 200,
    },
    mediaWindow: { x: 0, y: 620, width: 1080, height: 960 },
    headline: {
      kicker: '鏈上快訊',
      titleLines: ['世界盃最賺錢的生意'],
    },
    audio: { sourceUrl: '/audio/main.m4a', narrationDurationMs: 90_000 },
    bgm: { trackId: 'bgm-01', gainDb: -21 },
    outro: {
      startMs: 90_000,
      title: 'From Fed to Chain',
      callToAction: '訂閱・分享・留言',
    },
    slides: Array.from({ length: 9 }, (_, index) => {
      const sceneId = `scene-${String(index + 1).padStart(2, '0')}`;
      return {
        id: sceneId,
        startMs: index * 10_000,
        endMs: (index + 1) * 10_000,
        template: 'image',
        sources: [
          {
            id: `${sceneId}-source`,
            label: `${sceneId} source`,
            url: `https://images.example.test/pages/${sceneId}`,
            attribution: 'Example Photographer',
            license: 'unknown',
            licenseUrl: null,
          },
        ],
        asset: {
          kind: 'remoteImage',
          sourceId: `${sceneId}-source`,
          url: `https://images.example.test/${sceneId}.jpg`,
          sha256: 'a'.repeat(64),
          layout: 'fullBleed',
          position: 'center',
        },
      };
    }),
    captions: Array.from({ length: 9 }, (_, index) => ({
      startMs: index * 10_000,
      endMs: (index + 1) * 10_000,
      text: `字幕 ${index + 1}`,
    })),
  });
}

describe('vertical news video manifest (v3)', () => {
  it('parses a portrait manifest with headline, bgm, and outro tail', () => {
    const manifest = createVerticalManifest();
    expect(manifest.schemaVersion).toBe('podcast-slide-video.v3');
    expect(manifest.clip).toMatchObject({ width: 1080, height: 1920 });
    expect(manifest.clip.durationMs).toBe(
      manifest.audio.narrationDurationMs + OUTRO_TAIL_MS,
    );
    expect(manifest.mediaWindow).toEqual({
      x: 0,
      y: 620,
      width: 1080,
      height: 960,
    });
    expect(parseSlideVideoManifest(manifest)).toMatchObject({
      schemaVersion: 'podcast-slide-video.v3',
    });
  });

  it('rejects landscape clip dimensions on a v3 manifest', () => {
    const manifest = structuredClone(createVerticalManifest()) as unknown as {
      clip: { width: number; height: number };
    };
    manifest.clip.width = 1920;
    manifest.clip.height = 1080;
    expect(slideVideoManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('requires the clip to cover narration plus the outro tail exactly', () => {
    const manifest = createVerticalManifest();
    manifest.clip.durationMs = 90_000;
    expectCustomIssue(
      manifest,
      `Clip duration must equal narration plus the ${OUTRO_TAIL_MS}ms outro tail`,
    );
  });

  it('requires the outro to start when narration ends', () => {
    const manifest = createVerticalManifest();
    manifest.outro.startMs = 91_000;
    expectCustomIssue(manifest, 'Outro must start when narration ends');
  });

  it('requires slides and captions to end at the narration end, not the clip end', () => {
    const slideTail = createVerticalManifest();
    slideTail.slides.at(-1)!.endMs = slideTail.clip.durationMs;
    expectCustomIssue(
      slideTail,
      'The final slide must end at the narration end',
    );

    const captionTail = createVerticalManifest();
    captionTail.captions.at(-1)!.endMs = 90_100;
    expectCustomIssue(captionTail, 'Caption extends beyond the narration');
  });

  it('enforces headline display-unit budgets beyond raw length caps', () => {
    const wideKicker = createVerticalManifest();
    wideKicker.headline.kicker = '這是一個超過十四顯示單位的鉤子句';
    expectCustomIssue(wideKicker, 'Headline kicker exceeds 14 display units');

    const wideTitle = createVerticalManifest();
    wideTitle.headline.titleLines = ['這是一行超過十四個顯示單位的主標題'];
    expectCustomIssue(
      wideTitle,
      'Headline title line 1 exceeds 14 display units',
    );
  });

  it('rejects unknown bgm tracks and out-of-range gain', () => {
    const unknownTrack = structuredClone(
      createVerticalManifest(),
    ) as unknown as { bgm: { trackId: string; gainDb: number } };
    unknownTrack.bgm.trackId = 'bgm-99';
    expect(slideVideoManifestSchema.safeParse(unknownTrack).success).toBe(
      false,
    );

    const tooLoud = createVerticalManifest();
    tooLoud.bgm.gainDb = 3;
    expect(slideVideoManifestSchema.safeParse(tooLoud).success).toBe(false);
  });
});

describe('podcast slide video manifest', () => {
  it('parses the 90-second preview with every production template', () => {
    const manifest = loadPreviewManifest();

    expect(manifest.schemaVersion).toBe('podcast-slide-video.v1');
    expect(manifest.clip).toMatchObject({
      durationMs: 90_000,
      width: 1920,
      height: 1080,
      fps: 30,
      transitionMs: 200,
    });
    expect(manifest.slides).toHaveLength(9);
    expect(new Set(manifest.slides.map((slide) => slide.template))).toEqual(
      new Set(['cover', 'photoFact', 'statistic', 'document', 'sourceQuote']),
    );
    expect(manifest.captions).toHaveLength(31);
  });

  it('parses v2 as image-only while retaining unknown-license provenance', () => {
    const manifest = createImageManifest();
    expect(manifest.slides).toHaveLength(9);
    expect(
      manifest.slides.every(
        (slide) =>
          slide.template === 'image' &&
          slide.asset.kind === 'remoteImage' &&
          slide.asset.layout === 'fullBleed' &&
          slide.sources[0]?.license === 'unknown',
      ),
    ).toBe(true);
    expect(JSON.stringify(manifest.slides)).not.toMatch(
      /headline|quote|citation|facts/,
    );
  });

  it('requires every v2 scene to have a remote image and stable ID', () => {
    const missingImage = structuredClone(createImageManifest()) as unknown as {
      slides: { asset: unknown }[];
    };
    missingImage.slides[0]!.asset = { kind: 'none' };
    expect(slideVideoManifestSchema.safeParse(missingImage).success).toBe(
      false,
    );

    const unstableId = createImageManifest();
    unstableId.slides[0]!.id = 'opening';
    expectCustomIssue(unstableId, 'Scene 1 must use stable ID scene-01');
  });

  it('keeps 90-second v2 manifests within 8-10 image scenes', () => {
    const tooFew = createImageManifest();
    tooFew.slides = tooFew.slides.slice(0, 7);
    tooFew.slides.at(-1)!.endMs = 90_000;
    expectCustomIssue(
      tooFew,
      'A 90-second image video must contain 8-10 scenes',
    );
  });

  it('requires contiguous frame-aligned slides ending at the clip duration', () => {
    const gap = loadPreviewManifest();
    gap.slides[1]!.startMs = 4_100;
    expectCustomIssue(gap, 'Slide heat-dome must start at 4000ms');

    const reversed = loadPreviewManifest();
    reversed.slides[0]!.endMs = 0;
    expectCustomIssue(reversed, 'Slide opening-title must end after it starts');

    const shorterThanFade = loadPreviewManifest();
    shorterThanFade.slides[0]!.endMs = 100;
    shorterThanFade.slides[1]!.startMs = 100;
    expectCustomIssue(
      shorterThanFade,
      'Slide opening-title must be longer than the transition',
    );

    const offFrame = loadPreviewManifest();
    offFrame.slides[0]!.endMs = 4_010;
    offFrame.slides[1]!.startMs = 4_010;
    expectCustomIssue(
      offFrame,
      'Slide heat-dome start must align with a video frame',
    );

    const wrongFinalFrame = loadPreviewManifest();
    wrongFinalFrame.slides.at(-1)!.endMs = 89_000;
    expectCustomIssue(
      wrongFinalFrame,
      'The final slide must end at the clip duration',
    );
  });

  it('requires every visual asset to reference an attributed slide source', () => {
    const manifest = loadPreviewManifest();
    const slide = findSlide(manifest, 'heat-dome');
    if (slide.asset.kind !== 'remoteImage') {
      throw new Error('Expected the heat-dome remote image fixture');
    }
    slide.asset.sourceId = 'missing-source';

    expectCustomIssue(
      manifest,
      'Asset source missing-source is missing from slide sources',
    );
  });

  it('rejects full-bleed images whose source is not openly licensed', () => {
    const manifest = loadPreviewManifest();
    const slide = findSlide(manifest, 'large-load-cutoff');
    if (slide.asset.kind !== 'remoteImage') {
      throw new Error('Expected the mining remote image fixture');
    }
    const sourceId = slide.asset.sourceId;
    const source = slide.sources.find((candidate) => candidate.id === sourceId);
    if (!source) throw new Error('Missing mining image source fixture');
    source.license = 'all-rights-reserved';

    expectCustomIssue(
      manifest,
      'Full-bleed image bitcoin-mining-farm requires an open license',
    );
  });

  it('accepts each allowed full-bleed license', () => {
    const allowedLicenses = [
      'public-domain',
      'cc0',
      'cc-by-2.0',
      'cc-by-4.0',
      'cc-by-sa-4.0',
      'official-public-domain',
    ] as const;

    for (const license of allowedLicenses) {
      const manifest = loadPreviewManifest();
      const slide = findSlide(manifest, 'large-load-cutoff');
      if (slide.asset.kind !== 'remoteImage') {
        throw new Error('Expected the mining remote image fixture');
      }
      const sourceId = slide.asset.sourceId;
      const source = slide.sources.find(
        (candidate) => candidate.id === sourceId,
      );
      if (!source) throw new Error('Missing mining image source fixture');
      source.license = license;

      expect(slideVideoManifestSchema.safeParse(manifest).success).toBe(true);
    }
  });

  it('validates caption order, clip bounds, and the two-line maximum', () => {
    const reversed = loadPreviewManifest();
    reversed.captions[0]!.endMs = reversed.captions[0]!.startMs;
    expectCustomIssue(reversed, 'Caption must end after it starts');

    const beyondClip = loadPreviewManifest();
    beyondClip.captions.at(-1)!.endMs = 90_001;
    expectCustomIssue(beyondClip, 'Caption extends beyond the clip');

    const tooManyLines = loadPreviewManifest();
    tooManyLines.captions[0]!.text = '一\n二\n三';
    expectCustomIssue(tooManyLines, 'Caption may contain at most two lines');
  });

  it('enforces strict generated-timing invariants for non-v1 renderer versions', () => {
    const base = loadPreviewManifest();
    const strict: SlideVideoManifest = {
      ...base,
      rendererVersion: 'satori-resvg-v2',
    };

    const overlapping = {
      ...strict,
      captions: [
        strict.captions[0]!,
        {
          startMs: strict.captions[0]!.endMs - 100,
          endMs: strict.captions[0]!.endMs + 500,
          text: 'overlap',
        },
        ...strict.captions.slice(2),
      ],
    };
    expectCustomIssue(
      overlapping,
      'Captions must be ordered and non-overlapping',
    );

    const unaligned = {
      ...strict,
      captions: [
        { startMs: 0, endMs: 1_000, text: 'frame' },
        { startMs: 1_000, endMs: 2_032, text: 'off frame' },
      ],
    };
    expectCustomIssue(unaligned, 'Caption endMs must align with a video frame');

    const wrongStart = {
      ...strict,
      captions: strict.captions.map((caption, index) =>
        index === 0 ? { ...caption, startMs: 33 } : caption,
      ),
    };
    expectCustomIssue(wrongStart, 'Generated captions must start at 0ms');

    const wrongEnd = {
      ...strict,
      captions: strict.captions.slice(0, -1).concat([
        {
          ...strict.captions.at(-1)!,
          endMs: (strict.captions.at(-1)?.endMs ?? 0) - 100,
        },
      ]),
    };
    expectCustomIssue(
      wrongEnd,
      'Generated captions must end at the clip duration',
    );
  });

  it('rejects unknown properties and malformed versioned fields', () => {
    const manifest = loadPreviewManifest();
    const withUnknownField = {
      ...manifest,
      unexpected: true,
    };
    expect(slideVideoManifestSchema.safeParse(withUnknownField).success).toBe(
      false,
    );

    const malformedVersion = {
      ...manifest,
      rendererVersion: 'latest',
    };
    expect(slideVideoManifestSchema.safeParse(malformedVersion).success).toBe(
      false,
    );
  });
});
