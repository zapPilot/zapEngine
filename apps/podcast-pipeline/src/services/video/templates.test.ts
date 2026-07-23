import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ReactElement } from 'react';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import type { ResolvedSlideAsset } from './assets.js';
import type { ImageSlide, Slide, SlideSource } from './manifest.js';
import { runResvgStage } from './resvg-stage.js';
import { runSatoriStage } from './satori-stage.js';
import { runSharpScaleStage, runSharpStage } from './sharp-stage.js';
import {
  renderBrandFrameElement,
  renderOutroElement,
  renderSlideElement,
} from './templates.js';

const source = {
  id: 'scene-source',
  label: 'Source label must stay invisible',
  url: 'https://news.example.test/story',
  attribution: 'Attribution must stay invisible',
  license: 'unknown',
  licenseUrl: null,
} satisfies SlideSource;

const slide = {
  id: 'scene-01',
  startMs: 0,
  endMs: 10_000,
  template: 'image',
  sources: [source],
  asset: {
    kind: 'remoteImage',
    sourceId: source.id,
    url: 'https://images.example.test/scene.jpg',
    sha256: 'a'.repeat(64),
    layout: 'fullBleed',
    position: 'center',
  },
} satisfies ImageSlide;

const imageDataUri =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160"><rect width="3840" height="2160" fill="#315b48"/></svg>',
  ).toString('base64');

const imageAsset = {
  kind: 'image',
  dataUri: imageDataUri,
  contentType: 'image/svg+xml',
  layout: 'fullBleed',
  position: 'center',
  width: 3_840,
  height: 2_160,
  source,
} satisfies ResolvedSlideAsset;

let temporaryDirectory: string | null = null;

afterEach(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

describe('image-only slide template', () => {
  it('dispatches v2 scenes to the full-frame image layout', () => {
    const element = renderSlideElement(
      slide,
      imageAsset,
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
    expect(typeof element.type === 'function' ? element.type.name : '').toBe(
      'ImageTemplate',
    );
  });

  it('rejects a text-card fallback instead of rendering it', () => {
    const element = renderSlideElement(
      slide,
      {
        kind: 'fallback',
        reason: 'download failed',
        source,
      },
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
    if (typeof element.type !== 'function') {
      throw new Error('Expected image template component');
    }
    const renderComponent = element.type as unknown as (
      props: unknown,
    ) => unknown;
    expect(() => renderComponent(element.props)).toThrow(
      'Scene scene-01 requires a resolved remote image',
    );
  });
});

const LOGO_DATA_URI = 'data:image/svg+xml;base64,PHN2Zy8+';

function componentName(element: ReactElement): string {
  return typeof element.type === 'function'
    ? ((element.type as { name?: string }).name ?? '')
    : '';
}

describe('legacy cover slide template', () => {
  it('renders the cover layout with no sourced image asset', () => {
    const slide: Extract<Slide, { template: 'cover' }> = {
      id: 'cover-01',
      startMs: 0,
      endMs: 4_000,
      template: 'cover',
      kicker: 'ZAP PILOT',
      headline: '美國電網高溫警報',
      subheadline: '高畫質靜態投影片',
      sources: [source],
      asset: { kind: 'none' },
    };
    const element = renderSlideElement(
      slide,
      { kind: 'fallback', reason: 'Storyboard headline', source },
      LOGO_DATA_URI,
    );
    expect(componentName(element)).toBe('CoverTemplate');
  });
});

describe('legacy photo-fact slide template', () => {
  it('renders facts around a resolved image asset', () => {
    const slide: Extract<Slide, { template: 'photoFact' }> = {
      id: 'photoFact-01',
      startMs: 0,
      endMs: 4_000,
      template: 'photoFact',
      eyebrow: 'IMAGE',
      headline: 'Remote image',
      facts: ['Verified dimensions'],
      sources: [source],
      asset: {
        kind: 'remoteImage',
        sourceId: source.id,
        url: 'https://example.test/image.png',
        sha256: 'a'.repeat(64),
        layout: 'framed',
        position: 'center',
      },
    };
    const element = renderSlideElement(
      slide,
      { ...imageAsset, layout: 'framed', position: 'center' },
      LOGO_DATA_URI,
    );
    expect(componentName(element)).toBe('PhotoFactTemplate');
  });

  it('renders facts around a text-card fallback asset', () => {
    const slide: Extract<Slide, { template: 'photoFact' }> = {
      id: 'photoFact-02',
      startMs: 0,
      endMs: 4_000,
      template: 'photoFact',
      eyebrow: 'FALLBACK',
      headline: 'Card view',
      subheadline: 'Optional sub',
      facts: ['Single fact'],
      sources: [source],
      asset: { kind: 'none' },
    };
    const element = renderSlideElement(
      slide,
      {
        kind: 'fallback',
        reason: 'Editorial card',
        source,
      },
      LOGO_DATA_URI,
    );
    expect(componentName(element)).toBe('PhotoFactTemplate');
  });
});

describe('legacy statistic slide template', () => {
  it('renders the headline value with all optional sections', () => {
    const slide: Extract<Slide, { template: 'statistic' }> = {
      id: 'statistic-01',
      startMs: 0,
      endMs: 4_000,
      template: 'statistic',
      eyebrow: 'LOAD',
      value: '1.21',
      unit: 'GW',
      label: 'Peak demand',
      secondaryValue: '2.30',
      secondaryLabel: 'Forecast',
      context: 'Week-ahead outlook',
      sources: [source],
      asset: { kind: 'none' },
    };
    const element = renderSlideElement(
      slide,
      { kind: 'fallback', reason: 'Stat headline', source },
      LOGO_DATA_URI,
    );
    expect(componentName(element)).toBe('StatisticTemplate');
  });

  it('renders the headline value with only the required sections', () => {
    const slide: Extract<Slide, { template: 'statistic' }> = {
      id: 'statistic-02',
      startMs: 0,
      endMs: 4_000,
      template: 'statistic',
      eyebrow: 'BASE',
      value: '99',
      label: 'Reliability',
      sources: [source],
      asset: { kind: 'none' },
    };
    const element = renderSlideElement(
      slide,
      { kind: 'fallback', reason: 'Stat baseline', source },
      LOGO_DATA_URI,
    );
    expect(componentName(element)).toBe('StatisticTemplate');
  });
});

describe('legacy document slide template', () => {
  it('renders the primary document record without a sourced image', () => {
    const slide: Extract<Slide, { template: 'document' }> = {
      id: 'document-01',
      startMs: 0,
      endMs: 4_000,
      template: 'document',
      issuer: 'U.S. Department of Energy',
      documentNumber: 'OE-2026-04',
      date: '2026-04-12',
      headline: 'Order accepting reliability standards',
      excerpt: 'Implementation timeline remains in effect',
      sources: [source],
      asset: { kind: 'none' },
    };
    const element = renderSlideElement(
      slide,
      { kind: 'fallback', reason: 'Document record', source },
      LOGO_DATA_URI,
    );
    expect(componentName(element)).toBe('DocumentTemplate');
  });
});

describe('legacy source-quote slide template', () => {
  it('renders the quotation alongside a resolved image asset', () => {
    const slide: Extract<Slide, { template: 'sourceQuote' }> = {
      id: 'sourceQuote-01',
      startMs: 0,
      endMs: 4_000,
      template: 'sourceQuote',
      eyebrow: 'OPERATOR',
      quote: '"Capacity margins remain adequate into Q3"',
      context: 'Press briefing, May 2026',
      citation: 'PJM',
      sources: [source],
      asset: {
        kind: 'remoteImage',
        sourceId: source.id,
        url: 'https://example.test/quote.png',
        sha256: 'b'.repeat(64),
        layout: 'framed',
        position: 'center',
      },
    };
    const element = renderSlideElement(
      slide,
      { ...imageAsset, layout: 'framed', position: 'center' },
      LOGO_DATA_URI,
    );
    expect(componentName(element)).toBe('SourceQuoteTemplate');
  });

  it('renders the quotation with a fallback asset when no image is available', () => {
    const slide: Extract<Slide, { template: 'sourceQuote' }> = {
      id: 'sourceQuote-02',
      startMs: 0,
      endMs: 4_000,
      template: 'sourceQuote',
      eyebrow: 'WITHOUT PHOTO',
      quote: '"Margins continue to tighten"',
      citation: 'ISO-NE',
      sources: [source],
      asset: { kind: 'none' },
    };
    const element = renderSlideElement(
      slide,
      { kind: 'fallback', reason: 'No image available', source },
      LOGO_DATA_URI,
    );
    expect(componentName(element)).toBe('SourceQuoteTemplate');
  });
});

describe('satori-stage error paths', () => {
  it('throws when the data URI is not base64 encoded', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'satori-base64-'));
    const inputPath = join(temporaryDirectory, 'bad.json');
    const svgPath = join(temporaryDirectory, 'out.svg');
    await writeFile(
      inputPath,
      JSON.stringify({
        slide,
        asset: { ...imageAsset, dataUri: 'data:text/plain,hello' },
      }),
      'utf8',
    );
    await expect(runSatoriStage(inputPath, svgPath)).rejects.toThrow(
      'must be base64 encoded',
    );
  });

  it('throws when an image asset has neither dataUri nor filePath', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'satori-noasset-'));
    const inputPath = join(temporaryDirectory, 'noasset.json');
    const svgPath = join(temporaryDirectory, 'out.svg');
    const noUriAsset = { ...imageAsset, dataUri: undefined };
    await writeFile(
      inputPath,
      JSON.stringify({ slide, asset: noUriAsset }),
      'utf8',
    );
    await expect(runSatoriStage(inputPath, svgPath)).rejects.toThrow(
      'has neither dataUri nor filePath',
    );
  });
});

describe('legacy cover slide Satori rendering', () => {
  it('renders the cover layout through Satori', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'cover-satori-'));
    const inputPath = join(temporaryDirectory, 'cover.json');
    const svgPath = join(temporaryDirectory, 'cover.svg');
    const coverSlide: Slide = {
      id: 'cover-01',
      startMs: 0,
      endMs: 4_000,
      template: 'cover',
      kicker: 'ZAP PILOT',
      headline: '美國電網高溫警報',
      subheadline: '高畫質靜態投影片',
      sources: [source],
      asset: { kind: 'none' },
    };
    await writeFile(
      inputPath,
      JSON.stringify({
        slide: coverSlide,
        asset: { kind: 'fallback', reason: 'Cover headline', source },
      }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);
    const svg = await readFile(svgPath, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="3840"');
    expect(svg).toContain('height="2160"');
    expect(svg).not.toContain(source.label);
    expect(svg).not.toContain(source.attribution);
  }, 120_000);
});

describe('legacy statistic slide Satori rendering', () => {
  it('renders the statistic layout through Satori', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'stat-satori-'));
    const inputPath = join(temporaryDirectory, 'stat.json');
    const svgPath = join(temporaryDirectory, 'stat.svg');
    const statSlide: Slide = {
      id: 'stat-01',
      startMs: 0,
      endMs: 4_000,
      template: 'statistic',
      eyebrow: 'LOAD',
      value: '1.21',
      unit: 'GW',
      label: 'Peak demand',
      context: 'Week-ahead outlook',
      sources: [source],
      asset: { kind: 'none' },
    };
    await writeFile(
      inputPath,
      JSON.stringify({
        slide: statSlide,
        asset: { kind: 'fallback', reason: 'Stat headline', source },
      }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);
    const svg = await readFile(svgPath, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="3840"');
    expect(svg).toContain('height="2160"');
    expect(svg).not.toContain(source.label);
    expect(svg).not.toContain(source.attribution);
  }, 120_000);
});

describe('legacy document slide Satori rendering', () => {
  it('renders the document layout through Satori', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'doc-satori-'));
    const inputPath = join(temporaryDirectory, 'doc.json');
    const svgPath = join(temporaryDirectory, 'doc.svg');
    const docSlide: Slide = {
      id: 'doc-01',
      startMs: 0,
      endMs: 4_000,
      template: 'document',
      issuer: 'U.S. Department of Energy',
      documentNumber: 'OE-2026-04',
      date: '2026-04-12',
      headline: 'Order accepting reliability standards',
      excerpt: 'Implementation timeline remains in effect',
      sources: [source],
      asset: { kind: 'none' },
    };
    await writeFile(
      inputPath,
      JSON.stringify({
        slide: docSlide,
        asset: { kind: 'fallback', reason: 'Document record', source },
      }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);
    const svg = await readFile(svgPath, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="3840"');
    expect(svg).toContain('height="2160"');
    expect(svg).not.toContain(source.label);
    expect(svg).not.toContain(source.attribution);
  }, 120_000);
});

describe('native image raster stages', () => {
  it.each([
    { contentType: 'image/avif', format: 'avif' as const },
    { contentType: 'image/webp', format: 'webp' as const },
  ])(
    'normalizes $contentType scene assets to PNG before Satori renders them',
    async ({ contentType, format }) => {
      temporaryDirectory = await mkdtemp(
        join(tmpdir(), 'podcast-image-normalize-'),
      );
      const imagePath = join(temporaryDirectory, `scene.${format}`);
      const inputPath = join(temporaryDirectory, 'scene.json');
      const svgPath = join(temporaryDirectory, 'scene.svg');
      const image = sharp({
        create: {
          width: 96,
          height: 54,
          channels: 3,
          background: '#315b48',
        },
      });
      await (format === 'avif' ? image.avif() : image.webp()).toFile(imagePath);
      await writeFile(
        inputPath,
        JSON.stringify({
          slide,
          asset: {
            ...imageAsset,
            dataUri: undefined,
            filePath: imagePath,
            contentType,
            width: 96,
            height: 54,
          },
        }),
        'utf8',
      );

      await runSatoriStage(inputPath, svgPath);

      const svg = await readFile(svgPath, 'utf8');
      expect(svg).toContain('data:image/png;base64,');
      expect(svg).not.toContain(`data:${contentType};base64,`);
    },
    120_000,
  );

  it('fills the 4K frame with the image and Zap logo, without source copy', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'podcast-image-raster-'));
    const inputPath = join(temporaryDirectory, 'scene.json');
    const svgPath = join(temporaryDirectory, 'scene.svg');
    const masterPath = join(temporaryDirectory, 'scene-master.png');
    const outputPath = join(temporaryDirectory, 'scene-1080p.png');

    await writeFile(
      inputPath,
      JSON.stringify({ slide, asset: imageAsset }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);

    const svg = await readFile(svgPath, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="3840"');
    expect(svg).toContain('height="2160"');
    expect(svg).not.toContain(source.label);
    expect(svg).not.toContain(source.attribution);

    await runResvgStage(svgPath, masterPath);
    await expect(sharp(masterPath).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 3_840,
      height: 2_160,
    });

    await runSharpStage(masterPath, outputPath);
    await expect(sharp(outputPath).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 1_920,
      height: 1_080,
    });
  }, 120_000);
});

describe('vertical brand frame and outro templates', () => {
  it('dispatches headline and outro content to the portrait components', () => {
    const frameElement = renderBrandFrameElement(
      { kicker: '鏈上快訊', titleLines: ['世界盃最賺錢的生意'] },
      LOGO_DATA_URI,
    );
    expect(componentName(frameElement)).toBe('BrandFrameTemplate');

    const outroElement = renderOutroElement(
      { title: 'From Fed to Chain', callToAction: '訂閱・分享・留言' },
      LOGO_DATA_URI,
    );
    expect(componentName(outroElement)).toBe('OutroTemplate');
  });

  it('rasterizes the brand frame at 1080x1920 with a transparent media window', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'brand-frame-raster-'));
    const inputPath = join(temporaryDirectory, 'frame.json');
    const svgPath = join(temporaryDirectory, 'frame.svg');
    const masterPath = join(temporaryDirectory, 'frame-master.png');
    const outputPath = join(temporaryDirectory, 'frame.png');

    await writeFile(
      inputPath,
      JSON.stringify({
        kind: 'frame',
        frame: {
          kicker: '鏈上快訊',
          titleLines: ['世界盃最賺錢的生意', '暴漲三百倍'],
        },
      }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);

    const svg = await readFile(svgPath, 'utf8');
    expect(svg).toContain('width="2160"');
    expect(svg).toContain('height="3840"');

    await runResvgStage(svgPath, masterPath);
    await runSharpScaleStage(masterPath, outputPath);
    await expect(sharp(outputPath).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 1_080,
      height: 1_920,
    });

    // sharp's stats() reads the ORIGINAL input, ignoring chained operations —
    // materialize each extracted region to a buffer before measuring alpha.
    const regionStats = async (top: number, height: number) => {
      const region = await sharp(outputPath)
        .extract({ left: 0, top, width: 1_080, height })
        .png()
        .toBuffer();
      return sharp(region).stats();
    };

    const mediaWindow = await regionStats(640, 920);
    expect(mediaWindow.channels[3]?.max).toBe(0);

    const topBand = await regionStats(0, 600);
    expect(topBand.channels[3]?.min).toBe(255);

    const bottomBand = await regionStats(1_600, 320);
    expect(bottomBand.channels[3]?.min).toBe(255);
  }, 120_000);

  it('rasterizes the outro card fully opaque at 1080x1920', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'outro-raster-'));
    const inputPath = join(temporaryDirectory, 'outro.json');
    const svgPath = join(temporaryDirectory, 'outro.svg');
    const masterPath = join(temporaryDirectory, 'outro-master.png');
    const outputPath = join(temporaryDirectory, 'outro.png');

    await writeFile(
      inputPath,
      JSON.stringify({
        kind: 'outro',
        outro: { title: 'From Fed to Chain', callToAction: '訂閱・分享・留言' },
      }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);
    await runResvgStage(svgPath, masterPath);
    await runSharpScaleStage(masterPath, outputPath);

    await expect(sharp(outputPath).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 1_080,
      height: 1_920,
    });
    const stats = await sharp(outputPath).stats();
    const alpha = stats.channels[3];
    if (alpha) expect(alpha.min).toBe(255);
  }, 120_000);
});
