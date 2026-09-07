import { describe, expect, it } from 'vitest';

import {
  OUTRO_TAIL_MS,
  parseVerticalVideoManifest,
  type VerticalVideoManifest,
  verticalVideoManifestSchema,
} from './manifest.js';

function expectCustomIssue(
  manifest: VerticalVideoManifest,
  expectedMessage: string,
): void {
  const result = verticalVideoManifestSchema.safeParse(manifest);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected manifest validation to fail');
  expect(result.error.issues.map((issue) => issue.message)).toContain(
    expectedMessage,
  );
}

function findSlide(
  manifest: VerticalVideoManifest,
  id: string,
): VerticalVideoManifest['slides'][number] {
  const slide = manifest.slides.find((candidate) => candidate.id === id);
  if (!slide) throw new Error(`Missing test slide ${id}`);
  return slide;
}

function createVerticalManifest(): VerticalVideoManifest {
  return parseVerticalVideoManifest({
    schemaVersion: 'podcast-slide-video.v4',
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
      width: 720,
      height: 1280,
      fps: 24,
      transitionMs: 208,
    },
    mediaWindow: { x: 0, y: 413, width: 720, height: 640 },
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

describe('vertical news video manifest (v4)', () => {
  it('parses a 720p/24fps portrait manifest with headline, bgm, and outro tail', () => {
    const manifest = createVerticalManifest();
    expect(manifest.schemaVersion).toBe('podcast-slide-video.v4');
    expect(manifest.clip).toMatchObject({ width: 720, height: 1280, fps: 24 });
    expect(manifest.clip.durationMs).toBe(
      manifest.audio.narrationDurationMs + OUTRO_TAIL_MS,
    );
    expect(manifest.mediaWindow).toEqual({
      x: 0,
      y: 413,
      width: 720,
      height: 640,
    });
    expect(parseVerticalVideoManifest(manifest)).toMatchObject({
      schemaVersion: 'podcast-slide-video.v4',
    });
  });

  it('rejects landscape clip dimensions on a v4 manifest', () => {
    const manifest = structuredClone(createVerticalManifest()) as unknown as {
      clip: { width: number; height: number };
    };
    manifest.clip.width = 1920;
    manifest.clip.height = 1080;
    expect(verticalVideoManifestSchema.safeParse(manifest).success).toBe(false);
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
    expect(verticalVideoManifestSchema.safeParse(unknownTrack).success).toBe(
      false,
    );

    const tooLoud = createVerticalManifest();
    tooLoud.bgm.gainDb = 3;
    expect(verticalVideoManifestSchema.safeParse(tooLoud).success).toBe(false);
  });

  it('requires contiguous frame-aligned slides ending at the narration end', () => {
    const gap = createVerticalManifest();
    gap.slides[1]!.startMs = 4_100;
    expectCustomIssue(gap, 'Slide scene-02 must start at 10000ms');

    const reversed = createVerticalManifest();
    reversed.slides[0]!.endMs = 0;
    expectCustomIssue(reversed, 'Slide scene-01 must end after it starts');

    const shorterThanFade = createVerticalManifest();
    shorterThanFade.slides[0]!.endMs = 100;
    shorterThanFade.slides[1]!.startMs = 100;
    expectCustomIssue(
      shorterThanFade,
      'Slide scene-01 must be longer than the transition',
    );

    const offFrame = createVerticalManifest();
    offFrame.slides[0]!.endMs = 4_010;
    offFrame.slides[1]!.startMs = 4_010;
    expectCustomIssue(
      offFrame,
      'Slide scene-02 start must align with a video frame',
    );

    const wrongFinalFrame = createVerticalManifest();
    wrongFinalFrame.slides.at(-1)!.endMs = 89_000;
    expectCustomIssue(
      wrongFinalFrame,
      'The final slide must end at the narration end',
    );
  });

  it('requires every visual asset to reference an attributed slide source', () => {
    const manifest = createVerticalManifest();
    const slide = findSlide(manifest, 'scene-01');
    slide.asset.sourceId = 'missing-source';

    expectCustomIssue(
      manifest,
      'Asset source missing-source is missing from slide sources',
    );
  });

  it('validates caption order, clip bounds, and the two-line maximum', () => {
    const reversed = createVerticalManifest();
    reversed.captions[0]!.endMs = reversed.captions[0]!.startMs;
    expectCustomIssue(reversed, 'Caption must end after it starts');

    const beyondNarration = createVerticalManifest();
    beyondNarration.captions.at(-1)!.endMs = 90_001;
    expectCustomIssue(beyondNarration, 'Caption extends beyond the narration');

    const tooManyLines = createVerticalManifest();
    tooManyLines.captions[0]!.text = '一\n二\n三';
    expectCustomIssue(tooManyLines, 'Caption may contain at most two lines');
  });

  it('rejects unknown properties and malformed versioned fields', () => {
    const manifest = createVerticalManifest();
    const withUnknownField = {
      ...manifest,
      unexpected: true,
    };
    expect(
      verticalVideoManifestSchema.safeParse(withUnknownField).success,
    ).toBe(false);

    const malformedVersion = {
      ...manifest,
      rendererVersion: 'latest',
    };
    expect(
      verticalVideoManifestSchema.safeParse(malformedVersion).success,
    ).toBe(false);
  });
});
