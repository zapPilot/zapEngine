import { describe, expect, it } from 'vitest';

import { buildStaticSlideFilter } from './ffmpeg-video.js';
import type { SlideVideoManifest } from './manifest.js';

function manifestWithPresentation(input: {
  layout: 'fullBleed' | 'contain';
  motion: 'static' | 'pushIn' | 'pan';
}): SlideVideoManifest {
  return {
    schemaVersion: 'podcast-slide-video.v2',
    rendererVersion: 'satori-resvg-v3',
    episode: {
      id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      languageCode: 'zh-Hant',
      title: 'Editorial motion test',
    },
    clip: {
      startMs: 0,
      durationMs: 4_000,
      width: 1920,
      height: 1080,
      fps: 30,
      transitionMs: 200,
    },
    audio: { sourceUrl: 'https://cdn.example.test/audio.m4a' },
    slides: [
      {
        id: 'scene-01',
        startMs: 0,
        endMs: 4_000,
        template: 'image',
        sources: [
          {
            id: 'source-01',
            label: 'Example News',
            url: 'https://news.example.test/story',
            attribution: 'Example News',
            license: 'unknown',
            licenseUrl: null,
          },
        ],
        asset: {
          kind: 'remoteImage',
          sourceId: 'source-01',
          url: 'https://images.example.test/story.jpg',
          sha256: 'a'.repeat(64),
          layout: input.layout,
          position: 'center',
          motion: input.motion,
        },
      },
    ],
    captions: [{ startMs: 0, endMs: 4_000, text: '字幕' }],
  };
}

describe('v8 editorial image presentation', () => {
  it('shows contain images completely and keeps static assets actually static', () => {
    const filter = buildStaticSlideFilter(
      manifestWithPresentation({ layout: 'contain', motion: 'static' }),
      '/render/captions.ass',
      '/render/fonts',
    );

    expect(filter).toContain('force_original_aspect_ratio=decrease');
    expect(filter).toContain(
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x101014',
    );
    expect(filter).toContain("zoompan=z='1'");
    expect(filter).not.toContain('scale=1882:1058');
    expect(filter).not.toContain('1.15');
    expect(filter).not.toContain('0.1800');
  });

  it('ignores fullBleed push-in metadata and uses contain plus a safe 2% drift', () => {
    const filter = buildStaticSlideFilter(
      manifestWithPresentation({ layout: 'fullBleed', motion: 'pushIn' }),
      '/render/captions.ass',
      '/render/fonts',
    );

    expect(filter).toContain('force_original_aspect_ratio=decrease');
    expect(filter).toContain(
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x101014',
    );
    expect(filter).toContain("zoompan=z='1'");
    expect(filter).toContain('scale=1882:1058:flags=lanczos+accurate_rnd');
    expect(filter).toContain(
      'pad=1958:1102:(ow-iw)/2:(oh-ih)/2:color=0x101014',
    );
    expect(filter).toContain("crop=1920:1080:x='38*(1-");
    expect(filter).toContain('min(n/127\\,1)');
    expect(filter).not.toContain('force_original_aspect_ratio=increase');
    expect(filter).not.toContain("z='1+");
    expect(filter).not.toContain("z='1.04'");
    expect(filter).not.toContain("z='1.15'");
  });
});
