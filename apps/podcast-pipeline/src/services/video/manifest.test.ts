import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  parseSlideVideoManifest,
  type SlideVideoManifest,
  slideVideoManifestSchema,
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
