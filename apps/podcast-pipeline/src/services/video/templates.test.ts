import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import type { ResolvedSlideAsset } from './assets.js';
import type { Slide, SlideSource } from './manifest.js';
import { runResvgStage } from './resvg-stage.js';
import { runSatoriStage } from './satori-stage.js';
import { runSharpStage } from './sharp-stage.js';
import { renderSlideElement } from './templates.js';

const editorialSource = {
  id: 'zap-editorial',
  label: 'Zap Pilot Editorial',
  url: null,
  attribution: 'Zap Pilot editorial design',
  license: 'brand-generated',
  licenseUrl: null,
} satisfies SlideSource;

const fallbackAsset = {
  kind: 'fallback',
  reason: 'Source-first editorial card; no photograph used',
  source: editorialSource,
} satisfies ResolvedSlideAsset;

const slides = [
  {
    id: 'cover',
    startMs: 0,
    endMs: 4_000,
    template: 'cover',
    kicker: 'POWER GRID · HEAT DOME',
    headline: '高溫逼電網到牆角',
    subheadline: '比特幣礦場為何成了「背鍋俠」？',
    sources: [editorialSource],
    asset: { kind: 'none' },
  },
  {
    id: 'photo-fact',
    startMs: 4_000,
    endMs: 8_000,
    template: 'photoFact',
    eyebrow: 'HEAT DOME',
    headline: '熱穹頂壓向美國東部',
    subheadline: '極端高溫把需求推向歷史高位。',
    facts: ['持續異常高溫', '空調負載急升'],
    sources: [editorialSource],
    asset: { kind: 'none' },
  },
  {
    id: 'statistic',
    startMs: 8_000,
    endMs: 12_000,
    template: 'statistic',
    eyebrow: 'PEAK LOAD',
    value: '161,910',
    unit: 'MW',
    label: 'PJM 歷史第二高用電負荷',
    context: '供需緩衝快速收窄。',
    sources: [editorialSource],
    asset: { kind: 'none' },
  },
  {
    id: 'document',
    startMs: 12_000,
    endMs: 16_000,
    template: 'document',
    issuer: '美國能源部',
    documentNumber: '202-26-32',
    date: '2026-06-30',
    headline: 'PJM 緊急命令即刻生效',
    excerpt: '指定發電機組全力支援電網可靠度。',
    sources: [editorialSource],
    asset: { kind: 'none' },
  },
  {
    id: 'source-quote',
    startMs: 16_000,
    endMs: 20_000,
    template: 'sourceQuote',
    eyebrow: 'PRIMARY SOURCE',
    quote: '讓指定機組全力發電',
    context: '緊急授權只為維持電網可靠度。',
    citation: 'DOE ORDER NO. 202-26-32',
    sources: [editorialSource],
    asset: { kind: 'none' },
  },
] satisfies Slide[];

let temporaryDirectory: string | null = null;

afterEach(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

describe('renderSlideElement', () => {
  it('dispatches every manifest template to its dedicated layout', () => {
    const componentNames = slides.map((slide) => {
      const element = renderSlideElement(
        slide,
        fallbackAsset,
        'data:image/svg+xml;base64,PHN2Zy8+',
      );
      return typeof element.type === 'function'
        ? element.type.name
        : element.type;
    });

    expect(componentNames).toEqual([
      'CoverTemplate',
      'PhotoFactTemplate',
      'StatisticTemplate',
      'DocumentTemplate',
      'SourceQuoteTemplate',
    ]);
  });
});

describe('native slide raster stages', () => {
  it('renders Traditional Chinese at 4K and downsamples it to 1080p with bundled fonts', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'podcast-slide-raster-'));
    const inputPath = join(temporaryDirectory, 'slide.json');
    const svgPath = join(temporaryDirectory, 'slide.svg');
    const masterPath = join(temporaryDirectory, 'slide-master.png');
    const outputPath = join(temporaryDirectory, 'slide-1080p.png');

    await writeFile(
      inputPath,
      JSON.stringify({ slide: slides[0], asset: fallbackAsset }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);

    const svg = await readFile(svgPath, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="3840"');
    expect(svg).toContain('height="2160"');

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
